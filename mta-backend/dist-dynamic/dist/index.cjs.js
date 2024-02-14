'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backendPluginApi = require('@backstage/backend-plugin-api');
var backendCommon = require('@backstage/backend-common');
var express = require('express');
var openidClient = require('openid-client');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var express__default = /*#__PURE__*/_interopDefaultLegacy(express);

const ENTITY_APPLICATION_TABLE = "entity-application-mapping";
const OAUTH_MAPPING_TABLE = "oauth-mapping";
const migrationsDir = backendCommon.resolvePackagePath("@internal/plugin-mta-backend", "migrations");
class DataBaseEntityApplicationStoraage {
  constructor(knex, logger) {
    this.knex = knex;
    this.logger = logger;
  }
  static async create(knex, logger) {
    logger.info("Starting to migrate database");
    await knex.migrate.latest({
      directory: migrationsDir
    });
    return new DataBaseEntityApplicationStoraage(knex, logger);
  }
  async getApplicationIDForEntity(entityUID) {
    if (!entityUID) {
      return void 0;
    }
    const daoRaws = await this.knex.table(ENTITY_APPLICATION_TABLE).where((builder) => {
      builder.where("entityUID", entityUID);
    }).first();
    if (!daoRaws) {
      return void 0;
    }
    const applicationID = daoRaws;
    return applicationID;
  }
}
class OAuthBackstageIDMappingStorage {
  constructor(knex, logger) {
    this.knex = knex;
    this.logger = logger;
  }
  static async create(knex, logger) {
    logger.info("Starting to migrate database");
    await knex.migrate.latest({
      directory: migrationsDir
    });
    return new OAuthBackstageIDMappingStorage(knex, logger);
  }
  async saveRefreshTokenForUser(backstageID, refreshToken) {
    if (!backstageID || !refreshToken) {
      return void 0;
    }
    const r = await this.getRefreshTokenForUser(backstageID);
    if (r && r != refreshToken) {
      const res2 = await this.knex.table(OAUTH_MAPPING_TABLE).update({ "mtaOAuthRefreshToken": refreshToken }).where("backstageID", backstageID).then(
        (data) => {
          if (data === 1) {
            return true;
          }
          return false;
        }
      );
      return res2;
    }
    const res = this.knex.insert({ "backstageID": backstageID, "mtaOAuthRefreshToken": refreshToken }).into(OAUTH_MAPPING_TABLE).then((data) => {
      if (data.length === 1) {
        return true;
      }
      return false;
    });
    return res;
  }
  async getRefreshTokenForUser(backstageID) {
    if (!backstageID) {
      return void 0;
    }
    const v = await this.knex.table(OAUTH_MAPPING_TABLE).where({ backstageID }).first().then((data) => {
      if (!data) {
        return void 0;
      }
      return data.mtaOAuthRefreshToken;
    });
    return v;
  }
}

async function createRouter(options) {
  const { logger, config, database, identity, cache } = options;
  const dbClient = await database.getClient();
  await DataBaseEntityApplicationStoraage.create(dbClient, logger);
  const oauthMappingStorage = await OAuthBackstageIDMappingStorage.create(dbClient, logger);
  const cacheClient = await cache.getClient();
  config.getOptional("mta.token");
  const fronteEndBaseURL = config.getString("app.baseUrl");
  const backstageBaseURL = config.getString("backend.baseUrl");
  const baseUrl = config.getString("mta.url");
  const baseURLHub = baseUrl + "/hub";
  const realm = config.getString("mta.auth.realm");
  config.getString("mta.auth.clientID");
  const secret = config.getString("mta.auth.secret");
  const baseURLAuth = baseUrl + "/auth/realms/" + realm;
  const mtaAuthIssuer = await openidClient.Issuer.discover(baseURLAuth);
  const authClient = new mtaAuthIssuer.Client({
    client_id: "backstage",
    client_secret: secret,
    response_types: ["code"]
  });
  const code_verifier = openidClient.generators.codeVerifier();
  const code_challenge = openidClient.generators.codeChallenge(code_verifier);
  const router = express.Router();
  router.use(express__default["default"].json());
  router.use(async (request, response, next) => {
    var _a, _b, _c;
    if (request.path.includes("/cb") || request.path.includes("/health")) {
      next();
      return;
    }
    const backstageID = await identity.getIdentity({ request });
    let id = (_a = backstageID == null ? void 0 : backstageID.identity.userEntityRef) != null ? _a : "undefined";
    const u = new URL(backstageBaseURL + "/api/mta/cb/" + id);
    const org = request.headers.referer;
    logger.info("here2: " + org);
    u.searchParams.set("continueTo", (_b = request.headers.referer) != null ? _b : fronteEndBaseURL);
    logger.info("here" + u.toString());
    let accessToken = await cacheClient.get(String(id));
    const refreshToken = await oauthMappingStorage.getRefreshTokenForUser(String(id));
    if (!accessToken && !refreshToken) {
      const authorizationURL = authClient.authorizationUrl({
        redirect_uri: u.toString(),
        code_challenge,
        code_challenge_method: "S256"
      });
      response.statusCode = 401;
      response.json({ "loginURL": authorizationURL });
      return;
    }
    if (!accessToken && refreshToken) {
      const tokenSet = await authClient.refresh(String(refreshToken));
      if (!tokenSet || !tokenSet.access_token) {
        const authorizationURL = authClient.authorizationUrl({
          redirect_uri: u.toString(),
          code_challenge,
          code_challenge_method: "S256"
        });
        response.statusCode = 401;
        response.json({ "loginURL": authorizationURL });
        return;
      }
      logger.info("refreshed token");
      accessToken = String(tokenSet.access_token);
      cacheClient.set(String(id), String(tokenSet.access_token), { ttl: (_c = tokenSet.expires_in) != null ? _c : 60 * 1e3 });
      if (tokenSet.refresh_token && tokenSet.refresh_token != refreshToken) {
        oauthMappingStorage.saveRefreshTokenForUser(String(id), tokenSet.refresh_token);
      }
    }
    response.locals.accessToken = accessToken;
    next();
  });
  router.get("/health", async (request, response) => {
    logger.info("PING!");
    response.json({ status: "ok" });
  });
  router.get("/cb/:username", async (request, response) => {
    var _a, _b;
    logger.info("PONG!");
    const user = request.params.username;
    logger.info("user in callback:" + user);
    const continueTo = request.query.continueTo;
    const u = new URL(backstageBaseURL + "/api/mta/cb/" + user);
    if (continueTo) {
      u.searchParams.set("continueTo", continueTo.toString());
    }
    logger.info("in callback" + u.toString());
    const params = authClient.callbackParams(request);
    const tokenSet = await authClient.callback(u.toString(), params, { code_verifier });
    if (!tokenSet.access_token || !tokenSet.refresh_token) {
      response.status(401);
      response.json({});
      return;
    }
    cacheClient.set(user, tokenSet.access_token, { ttl: (_a = tokenSet.expires_in) != null ? _a : 60 * 1e3 });
    oauthMappingStorage.saveRefreshTokenForUser(user, tokenSet.refresh_token);
    response.redirect((_b = continueTo == null ? void 0 : continueTo.toString()) != null ? _b : fronteEndBaseURL);
    return;
  });
  router.get("/applications", async (request, response) => {
    const getResponse = fetch(baseURLHub + "/applications", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken
      },
      "method": "GET"
    });
    const status = await (await getResponse).status;
    if (status != 200) {
      response.status(status);
      response.json({ "status": status });
      return;
    }
    const j = await (await getResponse).json();
    response.json(j);
  });
  router.get("/applications/:id", async (request, response) => {
    const getResponse = fetch(baseURLHub + "/applications/" + request.params.id, {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken
      },
      "method": "GET"
    });
    const status = await (await getResponse).status;
    if (status != 200) {
      response.status(status);
      response.json({ "status": status });
      return;
    }
    const j = await (await getResponse).json();
    response.json(j);
  });
  router.get("/issues/:id", async (request, response) => {
    const getResponse = fetch(baseURLHub + "/applications/" + request.params.id + "/analysis/issues", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + response.locals.accessToken
      },
      "method": "GET"
    });
    const status = await (await getResponse).status;
    if (status != 200) {
      logger.error("resposne does not make sense %s", getResponse);
      response.status(status);
      response.json({ "status": status });
      return;
    }
    const j = await (await getResponse).json();
    response.json(j);
  });
  router.use(backendCommon.errorHandler());
  return router;
}

const mtaPlugin = backendPluginApi.createBackendPlugin({
  pluginId: "mta",
  register(env) {
    env.registerInit({
      deps: {
        logger: backendPluginApi.coreServices.logger,
        http: backendPluginApi.coreServices.httpRouter,
        config: backendPluginApi.coreServices.rootConfig,
        database: backendPluginApi.coreServices.database,
        identity: backendPluginApi.coreServices.identity,
        cache: backendPluginApi.coreServices.cache
      },
      async init({ logger, http, config, database, identity, cache }) {
        logger.info("Hello from example plugin");
        const winstonLogger = backendCommon.loggerToWinstonLogger(logger);
        winstonLogger.info("Url:" + config.getString("mta.url"));
        const pluginCacheManager = backendCommon.cacheToPluginCacheManager(cache);
        http.use(await createRouter({
          logger: winstonLogger,
          cache: pluginCacheManager,
          database,
          config,
          identity
        }));
      }
    });
  }
});

const dynamicPluginInstaller = {
  kind: "legacy",
  router: {
    pluginID: "mta",
    createPlugin: createRouter
  }
};

exports["default"] = mtaPlugin;
exports.dynamicPluginInstaller = dynamicPluginInstaller;
//# sourceMappingURL=index.cjs.js.map
