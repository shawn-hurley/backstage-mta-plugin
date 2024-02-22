import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  coreServices,
} from '@backstage/backend-plugin-api';
import { Issuer, generators } from 'openid-client';

/**
 * Creates an `acme:example` Scaffolder action.
 *
 * @remarks
 *
 * See {@link https://example.com} for more information.
 *
 * @public
 */
export async function createMTAApplicatonAction(opts) {
  const {config, logger} = opts
  // For more information on how to define custom actions, see
  //   https://backstage.io/docs/features/software-templates/writing-custom-actions
    const baseUrl = config.getString('mta.url');
    const baseURLHub = baseUrl + "/hub"
    const realm = config.getString('mta.providerAuth.realm')
    const clientID = config.getString('mta.providerAuth.clientID')
    const secret = config.getString('mta.providerAuth.secret')
    const baseURLAuth = baseUrl+"/auth/realms/"+realm
    const mtaAuthIssuer = await Issuer.discover(baseURLAuth);
    const authClient = new mtaAuthIssuer.Client({
        client_id: clientID,
        client_secret: secret,
        response_types: ['code'],
    })
    const code_verifier = generators.codeVerifier();
    const code_challenge = generators.codeChallenge(code_verifier);

    const tokenSet = await authClient.grant({
        grant_type: "client_credentials"
    });
    if (!tokenSet.access_token) {
      logger.info("unable to access hub")
    }

  return createTemplateAction<{
    name: string;
    repo: string;
  }>({
    id: 'mta:createApplication',
    description: 'create applicaton in MTA',
    schema: {
      input: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            title: 'Name of the application',
            description: 'Name will be the display name in MTA appliation, will be the name seen in the catalog',
            type: 'string',
          },
          repo: {
            title: 'Repository',
            description: 'URL to the repository',
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      ctx.logger.info(
        `Running example template with parameters: ${ctx.input.name} -- ${ctx.input.repo}`,
      );

      const getResponse = await fetch(baseURLHub+"/applications", {
        "credentials": "include",
        "headers": {
          "Accept": "application/json, text/plain, */*",
          "Authorization": "Bearer " + tokenSet.access_token, 
          "Content-Type": "application/json",
        },
        "method": "POST",
        "body": JSON.stringify({"name": ctx.input.name})
      })
      if (getResponse.status != 200) {
        ctx.logger.info("unable to call hub " + getResponse.status + " message " + JSON.stringify(getResponse.text()))
          return
      }
      const j = await getResponse.json()
      if (!Array.isArray(j)) {
        ctx.logger.info("expecting array of applications")
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    },
  });
}
