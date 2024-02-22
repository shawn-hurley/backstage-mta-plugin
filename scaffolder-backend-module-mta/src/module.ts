import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import { createMTAApplicatonAction } from './actions/mta/create-application';
import { loggerToWinstonLogger } from '@backstage/backend-common';

export const mtaScaffolderModule = createBackendModule({
    pluginId: 'scaffolder',
    moduleId: 'mta',
    register({ registerInit }) {
        registerInit({
            deps: {
                scaffolder: scaffolderActionsExtensionPoint,
                config: coreServices.rootConfig,
                logger: coreServices.logger,
            },
            async init( {scaffolder, config, logger} )  {
                // Create a shared client to talk to MTA.
                const createAction = await createMTAApplicatonAction({
                    config: config,
                    logger: loggerToWinstonLogger(logger),
                })
                scaffolder.addActions(
                    createAction
                )
            }
        })
    }
})