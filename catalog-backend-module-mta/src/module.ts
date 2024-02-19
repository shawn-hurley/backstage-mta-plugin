
import {
  coreServices,
  createBackendPlugin,
  createBackendModule
} from '@backstage/backend-plugin-api';
import { MTAProvider } from './provider/MTAEntityProvider'
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { loggerToWinstonLogger } from '@backstage/backend-common';

export const catalogMTAModule = createBackendModule({
pluginId: 'catalog',
moduleId: 'mta-entity-provider',
register(env) {
  env.registerInit({
    deps: {
      config: coreServices.rootConfig,
      catalog: catalogProcessingExtensionPoint,
      logger: coreServices.logger,
      scheduler: coreServices.scheduler,
    },
    async init({config, catalog, logger, scheduler}) {
      catalog.addEntityProvider(
          MTAProvider.newProvider(config, loggerToWinstonLogger(logger), scheduler),
      )
    }
  })
}
})