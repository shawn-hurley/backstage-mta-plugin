import { createPlugin, createRoutableExtension, discoveryApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { createApiFactory, createApiExtension} from '@backstage/frontend-plugin-api';

import { rootRouteRef } from './routes';
import { mtaApiRef, DefaultMtaApi } from './api/api.ts'

// const exampleApi = createApiExtension({
//   factory: createApiFactory({
//     api: mtaApiRef,
//     deps: {},
//     factory: () => new DefaultMtaApi(),
//   }),
// });

export const mtaPlugin = createPlugin({
  id: 'mta',
  apis: [
    createApiFactory({
      api: mtaApiRef,
      deps: {discoveryApi: discoveryApiRef, identityApi: identityApiRef},
      factory: ({discoveryApi, identityApi}) => {
        return new DefaultMtaApi({ discoveryApi, identityApi });
      }
    })
  ],
  routes: {
    entityContent: rootRouteRef,
  },
});

export const EntityMTAContent = mtaPlugin.provide(
  createRoutableExtension({
    name: 'EntityMtaContent',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
