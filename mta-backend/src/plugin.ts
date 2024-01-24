// plugins/example-backend/src/plugin.ts
import {
    coreServices,
    createBackendPlugin,
  } from '@backstage/backend-plugin-api';
import { createRouter } from './service/router';
import { loggerToWinstonLogger } from '@backstage/backend-common';
  
export const mtaPlugin = createBackendPlugin({
    pluginId: 'mta',
    register(env) {
      env.registerInit({
        deps: {
            logger: coreServices.logger,
            http: coreServices.httpRouter,
            config: coreServices.rootConfig,
            database: coreServices.database,
        },
        async init({ logger, http, config, database }) {
          logger.info('Hello from example plugin');
          const winstonLogger = loggerToWinstonLogger(logger)

          winstonLogger.info("Url:" + config.getString('mta.url'))

          const client = await database.getClient()


          http.use(await createRouter({
            logger: winstonLogger,
            url: config.getString('mta.url'),
            client: client,
          }))
        },
      });
    },
});