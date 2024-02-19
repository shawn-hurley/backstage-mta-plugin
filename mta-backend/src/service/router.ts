import { errorHandler } from '@backstage/backend-common';
import express, { Router } from 'express';
import { PluginCacheManager, PluginDatabaseManager } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import { IdentityApi } from '@backstage/plugin-auth-node';
import { Logger } from 'winston';
import { Issuer, generators } from 'openid-client';
import { DataBaseEntityApplicationStoraage} from '../database/storage';


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

  // Use the cache for short lived access token
  // Use database mapping for refreshToken
  const cacheClient = await cache.getClient()
  
  // If a user wants to just make a long lived token to always use to MTA auth
  const mtaToken = config.getOptional('mta.token')

  const fronteEndBaseURL = config.getString('app.baseUrl')
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
    
    const u = new URL(backstageBaseURL+"/api/mta/cb/"+id)
    const org  = request.headers.referer
    
    logger.info("here2: " + org)
    u.searchParams.set("continueTo", request.headers.referer?? fronteEndBaseURL)
    logger.info("here" + u.toString())
    
    let accessToken = await cacheClient.get(String(id))
    const refreshToken = await entityApplicationStorage.getRefreshTokenForUser(String(id))
    
    if (!accessToken && !refreshToken) {
      const authorizationURL = authClient.authorizationUrl({
        redirect_uri: u.toString(),
        code_challenge,
        code_challenge_method: 'S256',
      })
      response.statusCode = 401;
      response.json({"loginURL": authorizationURL})
      return
    }
    if (!accessToken && refreshToken) {
      const tokenSet = await authClient.refresh(String(refreshToken))
      if (!tokenSet || !tokenSet.access_token) {
        const authorizationURL = authClient.authorizationUrl({
          redirect_uri: u.toString(),
          code_challenge,
          code_challenge_method: 'S256',
        })
      response.statusCode = 401;
      response.json({"loginURL": authorizationURL})
        return
      }
      logger.info("refreshed token")
      accessToken = String(tokenSet.access_token)
      cacheClient.set(String(id), String(tokenSet.access_token), {ttl: tokenSet.expires_in?? 60 * 1000})
      if (tokenSet.refresh_token && tokenSet.refresh_token != refreshToken) {
        //if updated, then we should update the database
        entityApplicationStorage.saveRefreshTokenForUser(String(id), tokenSet.refresh_token)
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
    logger.info("user in callback:" +  user)
    const continueTo = request.query.continueTo
    const u = new URL(backstageBaseURL+"/api/mta/cb/"+user)
    if (continueTo) {
      u.searchParams.set("continueTo", continueTo.toString() )
    }
    logger.info("in callback" + u.toString())
    const params = authClient.callbackParams(request);
    const tokenSet = await authClient.callback(u.toString(), params, { code_verifier });
    // Store the tokenSet in the cache

    if (!tokenSet.access_token || !tokenSet.refresh_token) {
      response.status(401)
      response.json({})
      return
    }

    // Default expire to 1min
    cacheClient.set(user, tokenSet.access_token, {ttl: tokenSet.expires_in ?? 60 * 1000})
    const out = entityApplicationStorage.saveRefreshTokenForUser(user, tokenSet.refresh_token)
    response.redirect(continueTo?.toString() ?? fronteEndBaseURL)
    return

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

  router.get('/application/entity/:id', async(request, response) => {
    const applicatonID = await entityApplicationStorage.getApplicationIDForEntity(request.params.id)
    if (!applicatonID) {
      response.status(404)
      response.json({"message": "no application mapped"})
      return
    }

    logger.info("found application: " + applicatonID)
    
    const getResponse = fetch(baseURLHub+"/applications/"+applicatonID, {
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

  router.post('/application/entity', async(request, response) => {
    const {entityID, applicationID}= request.body
    logger.info("attempting to save: " + entityID + " "+ applicationID)
    const res = await entityApplicationStorage.saveApplicationIDForEntity(entityID, applicationID)
    logger.info("attempting to save: " + entityID + " "+ applicationID+ " result" + res)
    if (!res) {
      response.status(500)
      response.json({})
      return
    }

    response.status(201)
    response.json({"entityID": entityID, "applicationID": applicationID})
    return
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
