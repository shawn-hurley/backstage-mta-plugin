import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { mtaPlugin, MtaPage } from '../src/plugin';

createDevApp()
  .registerPlugin(mtaPlugin)
  .addPage({
    element: <MtaPage />,
    title: 'Root Page',
    path: '/mta'
  })
  .render();
