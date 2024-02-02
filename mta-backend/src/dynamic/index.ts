import { BackendDynamicPluginInstaller } from '@janus-idp/backend-plugin-manager';

import { createRouter } from '../service/router';

export const dynamicPluginInstaller: BackendDynamicPluginInstaller = {
  kind: 'legacy',
  router: {
    pluginID: "mta",
    createPlugin: createRouter 
  },
};