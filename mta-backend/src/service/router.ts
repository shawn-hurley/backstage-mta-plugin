import { errorHandler } from '@backstage/backend-common';
import express, { Router } from 'express';
import { PluginCacheManager, PluginDatabaseManager } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import { IdentityApi } from '@backstage/plugin-auth-node';
import { Logger } from 'winston';
import { Issuer } from 'openid-client';
import { DataBaseEntityApplicationStoraage, EntityApplicationStorage, OAuthBackstageIDMappingStorage } from '../database/storage';
import { generators } from 'openid-client';


export interface RouterOptions {
  logger: Logger,
  database: PluginDatabaseManager,
  config: Config,
  identity: IdentityApi,
  cache: PluginCacheManager,
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, database, identity, cache } = options;

  const dbClient = await database.getClient();
  const entityApplicationStorage  = await DataBaseEntityApplicationStoraage.create(dbClient, logger)
  const oauthMappingStorage = await OAuthBackstageIDMappingStorage.create(dbClient, logger)

  // Use the cache for short lived access token
  // Use database mapping for refreshToken
  const cacheClient = await cache.getClient()
  
  // If a user wants to just make a long lived token to always use to MTA auth
  const mtaToken = config.getOptional('mta.token')

  const backstageBaseURL = config.getString('backend.baseUrl')
  const baseUrl = config.getString('mta.url');
  const baseURLHub = baseUrl+"/hub"

  // Set up the oidc provider client
  const realm = config.getString('mta.auth.realm')
  const clientID = config.getString('mta.auth.clientID')
  const secret = config.getString('mta.auth.secret')
  const baseURLAuth = baseUrl+"/auth/realms/"+realm
  const mtaAuthIssuer = await Issuer.discover(baseURLAuth);
  const authClient = new mtaAuthIssuer.Client({
    client_id: 'backstage',
    client_secret: secret,
    response_types: ['code'],
  })
  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);

  const router = Router();
  router.use(express.json());

  // Need to implemnt an oauth workflow in the future.

  // Need endpoint to get/create Analysis Runs.
  // There needs to be a config for this, that will be application/plugin wide.
  // Route to get Application Information (tags/acrhetypes)


  // oauth middleware
  router.use(async (request, response, next) => {
    if (request.path.includes('/cb') || request.path.includes('/health')) {
      next();
      return
    }

    const backstageID = await identity.getIdentity( { request })
    let id: string = backstageID?.identity.userEntityRef ?? "undefined"
    // if (backstageID) {
    //   logger.info("id found, setting auth for the backstage user")
    //   id = backstageID.identity.userEntityRef
    // }
    let accessToken = await cacheClient.get(String(id))
    const refreshToken = await oauthMappingStorage.getRefreshTokenForUser(String(id))
    logger.info("refreshToken: " + refreshToken)
    
    if (!accessToken && !refreshToken) {
      const authorizationURL = authClient.authorizationUrl({
        redirect_uri: backstageBaseURL+"/api/mta/cb/"+id,
        code_challenge,
        code_challenge_method: 'S256',
      })
      logger.info("login_url: " + authorizationURL)
      response.statusCode = 401;
      response.json({"loginURL": authorizationURL})
      return
    }
    if (!accessToken && refreshToken) {
      const tokenSet = await authClient.refresh(String(refreshToken))
      if (!tokenSet || !tokenSet.access_token) {
        const authorizationURL = authClient.authorizationUrl({
          redirect_uri: backstageBaseURL+"/api/mta/cb/"+id,
          code_challenge,
          code_challenge_method: 'S256',
        })
        logger.info("login_url: " + authorizationURL)
      response.statusCode = 401;
      response.json({"loginURL": authorizationURL})
        return
      }
      logger.info("refreshed token")
      accessToken = String(tokenSet.access_token)
      cacheClient.set(String(id), String(tokenSet.access_token), {ttl: tokenSet.expires_in?? 60 * 1000})
      if (tokenSet.refresh_token != refreshToken) {
        //if updated, then we should update the database
        logger.info("TODO: UPDATE REFRESH TOKEN")
      }
    }
    
    
    response.locals.accessToken = accessToken
    next();
  })

  // Routes
  // Route to test authentication, and health of backend service
  router.get('/health', async (request, response) => {
    logger.info('PING!');
    response.json({ status: 'ok' });
  });

  router.get('/cb/:username', async (request, response) => {
    logger.info('PONG!')
    const user = request.params.username
    const params = authClient.callbackParams(request);
    const tokenSet = await authClient.callback(backstageBaseURL+"/api/mta/cb/"+user, params, { code_verifier });
    // Store the tokenSet in the cache
    logger.log('received and validated tokens %j', tokenSet);
    logger.log('validated ID Token claims %j', tokenSet.claims());

    if (!tokenSet.access_token || !tokenSet.refresh_token) {
      response.status(401)
      response.json({})
      return
    }

    // Add timeout
    logger.info("got expires in: " +tokenSet.expires_in)
    // Default expire to 1min
    cacheClient.set(user, tokenSet.access_token, {ttl: tokenSet.expires_in ?? 60 * 1000})
    const out = oauthMappingStorage.saveRefreshTokenForUser(user, tokenSet.refresh_token)

    // Eventually this should redirect back the enitity page
    response.json({})
  })

  router.get('/applications', async(request, response) => {
    const getResponse = fetch(baseURLHub+"/applications", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken, 
      },
      "method": "GET",
    })

    const status = await (await getResponse).status
    if (status != 200) {
      response.status(status)
      response.json({ "status": status})
      return
    }
    const j = await (await getResponse).json()
    response.json(j)
  })

  router.get('/applications/:id', async(request, response) => {
    const getResponse = fetch(baseURLHub+"/applications/"+request.params.id, {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken, 
      },
      "method": "GET",
    })

    const status = await (await getResponse).status
    if (status != 200) {
      response.status(status)
      response.json({ "status": status})
      return
    }
    const j = await (await getResponse).json()
    response.json(j)

  })

  router.get('/issues/:id', async(request, response) => {
    const getResponse = fetch(baseURLHub+"/applications/"+request.params.id+"/analysis/issues", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken, 
      },
      "method": "GET",
    })

    const status = await (await getResponse).status
    if (status != 200) {
      logger.error("resposne does not make sense %s", getResponse)
      response.status(status)
      response.json({ "status": status})
      return
    }
    const j = await (await getResponse).json()
    response.json(j)
  })

  


  router.use(errorHandler());
  return router;
}
