import { createPlugin, createRoutableExtension } from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const mtaPlugin = createPlugin({
  id: 'mta',
  routes: {
    root: rootRouteRef,
  },
});

export const MtaPage = mtaPlugin.provide(
  createRoutableExtension({
    name: 'MtaPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
