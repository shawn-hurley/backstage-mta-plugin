import { ComponentEntityV1alpha1} from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { Issuer, generators } from 'openid-client';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Logger } from 'winston';
import { SchedulerService } from '@backstage/backend-plugin-api';
import { MTAComponentEnitty } from './mtaComponentEntity';
import { LocationSpec } from '@backstage/plugin-catalog-common';
import {locationSpecToLocationEntity} from '@backstage/plugin-catalog-node';


/**
 * Provides entities from fictional frobs service.
 */
export class MTAProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly config: Config
  private readonly logger: Logger
  private readonly scheduler: SchedulerService


  static newProvider(config: Config, logger: Logger, scheduler: SchedulerService): MTAProvider {
    const p = new MTAProvider(config, logger, scheduler)
    // scheduler.scheduleTask({
    //   frequency: { minutes: 10 },
    //   timeout: { seconds: 30 },
    //   id: 'sync-mta-catalog',
    //   fn: p.run
    // })

    return p
  }
  /** [1] */
  constructor(config: Config, logger: Logger, scheduler: SchedulerService) {
    this.config = config;
    this.logger = logger;
    this.scheduler = scheduler
  }

  /** [2] */
  getProviderName(): string {
    return `MTAProvider`;
  }

  /** [3] */
  async connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info("connecting")
    this.connection = connection;
    // this.scheduler.scheduleTask({
    //   frequency: { minutes: 10 },
    //   timeout: { seconds: 30 },
    //   id: 'sync-mta-catalog',
    //   fn: run
    // })
    await this.run()
  }

  /** [4] */
  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not initialized');
    }
    this.logger.info("here")
    
    // 
    const baseUrl = this.config.getString('mta.url');
    const baseURLHub = baseUrl + "/hub"
    const realm = this.config.getString('mta.providerAuth.realm')
    const clientID = this.config.getString('mta.providerAuth.clientID')
    const secret = this.config.getString('mta.providerAuth.secret')
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
      this.logger.info("unable to access hub")
    }
    
    const getResponse = await fetch(baseURLHub+"/applications", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Authorization": "Bearer " + tokenSet.access_token, 
      },
      "method": "GET",
    })

    if (getResponse.status != 200) {
      this.logger.info("unable to call hub " + status + " message " + JSON.stringify(getResponse.text()))
      return
    }
    const j = await getResponse.json()
    if (!Array.isArray(j)) {
      this.logger.info("expecting array of applications")
      return
    }

    this.logger.info("status: " + getResponse.status + " json " + JSON.stringify(j))
    // /** [6] */
    await this.connection.applyMutation({
      type: 'full',
      entities: j.map(application => {
        return {
          locationKey: this.getProviderName(),
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: {
              annotations: {
                "backstage.io/managed-by-location": "url:"+baseURLHub+"/application/"+application.id,
                "backstage.io/managed-by-origin-location": "url:"+baseURLHub+"/application/"+application.id,
              },
              name: application.name,
              namespace: 'default',
            },
            spec: {
              type: 'serivce',
              lifecycle: 'experimental',
              owner: 'unknown',
            },
          }        
        };
      }),
    });
  }

}