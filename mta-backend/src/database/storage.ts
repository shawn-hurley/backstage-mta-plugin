import { resolvePackagePath } from "@backstage/backend-common";
import { Knex } from 'knex'
import { Logger } from "winston";

const ENTITY_APPLICATION_TABLE= 'entity-application-mapping'
const OAUTH_MAPPING_TABLE= 'oauth-mapping'
const migrationsDir = resolvePackagePath('@internal/plugin-mta-backend', 'migrations')


export interface EntityApplicationStorage {
    getApplicationIDForEntity(entityUID: string): Promise<string | undefined>
}

export class DataBaseEntityApplicationStoraage implements EntityApplicationStorage {
    public constructor(
        private readonly knex: Knex<any, any[]>,
        private readonly logger: Logger
    ) {}

    static async create(
        knex: Knex<any, any[]>,
        logger: Logger,
      ): Promise<EntityApplicationStorage> {
        logger.info("Starting to migrate database")
        await knex.migrate.latest({
            directory: migrationsDir,
        });

        return new DataBaseEntityApplicationStoraage(knex, logger)
      }

    async getApplicationIDForEntity(entityUID: string): Promise<string | undefined> {
        if (!entityUID) {
            return undefined;
        }
        const daoRaws = await this.knex.table(ENTITY_APPLICATION_TABLE).where(builder => {
            builder.where('entityUID', entityUID)
        }).first()

        if (!daoRaws) {
            return undefined;
        }
        const applicationID: string = daoRaws;
        return applicationID
    }
}

export interface OAuthBackstageIDMapping {
    // String of success or not??? 
    saveRefreshTokenForUser(backstageID: string, refreshToken: string): Promise<Boolean| undefined>
    getRefreshTokenForUser(backstageID: string): Promise<String | undefined>
}
export class OAuthBackstageIDMappingStorage implements OAuthBackstageIDMapping{
    public constructor(
        private readonly knex: Knex<any, any[]>,
        private readonly logger: Logger
    ) {}

    static async create(
        knex: Knex<any, any[]>,
        logger: Logger,
      ): Promise<OAuthBackstageIDMapping> {
        logger.info("Starting to migrate database")
        await knex.migrate.latest({
            directory: migrationsDir,
        });

        return new OAuthBackstageIDMappingStorage(knex, logger)
      }

    async saveRefreshTokenForUser(backstageID: string, refreshToken: string): Promise<Boolean| undefined> {
        if (!backstageID || !refreshToken) {
            return undefined;
        }
        const r= await this.getRefreshTokenForUser(backstageID)

        if (r && r != refreshToken) {
            const res = await this.knex.table(OAUTH_MAPPING_TABLE).update({"mtaOAuthRefreshToken": refreshToken}).where('backstageID', backstageID)
                .then((data) => {
                    if (data === 1) {
                        return true;
                    }
                    return false;
                }
            );
            return res 
        }

        const res = this.knex.insert({"backstageID": backstageID, "mtaOAuthRefreshToken": refreshToken}).into(OAUTH_MAPPING_TABLE)
            .then((data) => {
                if (data.length === 1) {
                    return true
                }
                return false;
            });
        return res
    }

    async getRefreshTokenForUser(backstageID: string): Promise<String | undefined> {
        if (!backstageID)  {
            return undefined;
        }   

        const v: string = await this.knex.table(OAUTH_MAPPING_TABLE).where({backstageID: backstageID}).first().then((data) => {
            if (!data) {
                return undefined
            }
            return data.mtaOAuthRefreshToken
        })
        return v
    }
}
