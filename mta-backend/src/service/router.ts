import { errorHandler } from '@backstage/backend-common';
import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';

export interface RouterOptions {
  logger: Logger;
  url: string,
  client: Knex<any, any[]>,
  i
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, url} = options;
  

  const router = Router();
  router.use(express.json());


  // Need to implemnt an oauth workflow in the future.

  // Core code to use in all routes, to get user identity and matching oauth token
  // Core code to use entity/component mapping to Application ID

  // Need a Database table, to hold backstage identiy to oauth token
  // Need a database table to hold enity/component mapping 

  // Need endpoint to get Tags
  // Need endpoint to get Archetypes
  // Need endpoint to get Analysis Runs
  // Need endpoint to get Assesments
  // Need endpoint to get/create Analysis Runs.
    // There needs to be a config for this, that will be application/plugin wide.



  // Route to get Application Information (tags/acrhetypes)
  router.get('/health', (_, response) => {
    logger.info('PONG!');
    logger.info("url to use: "+ url)
    response.json({ status: 'ok' });
  });
  router.use(errorHandler());
  return router;
}
