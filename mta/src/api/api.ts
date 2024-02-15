import { DiscoveryApi, IdentityApi, createApiRef } from "@backstage/core-plugin-api";


export type Tags = {
    name: string;
    source: SourceBuffer;
    virutal: boolean;
}

export type Ref = {
    id: number;
    name: string;
}

export type Application = {
    id: string;
    name: string;
    description: string;
    buisnessService?: Ref;
    assessed: boolean;
    owner?: Ref;
    tags?: Tags[];
}
export interface MTAApi {
    getApplications(): Promise<Application[] | URL>
    getApplication(entityID: string): Promise<Application | undefined | URL>
    saveApplicationEntity(applicationID: string, entityID): Promise<Application | URL>
    getExample(): { example: string };

}

export const mtaApiRef = createApiRef<MTAApi>({
    id: 'plugin.mta'
});

export class DefaultMtaApi implements MTAApi {
    private readonly discoveryApi: DiscoveryApi;
    private readonly identityApi: IdentityApi;
    
    async getApplications(): Promise<Application[] | URL > {
        const url = await this.discoveryApi.getBaseUrl('mta')
        const {token: idToken } = await this.identityApi.getCredentials();
        const ref = window.location.href
        console.log(ref)
        

        const response = await fetch(url+"/applications", {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(idToken && { Authorization: `Bearer ${idToken}` }),

            },
            //referrer: window.location.href,
            referrerPolicy: 'no-referrer-when-downgrade',
            redirect: 'error',
        });
        const j =  await response.json()
        if (response.status === 401) {
            // Create login pop-up
            console.log(j.loginURL)
            return new URL(j.loginURL)
        }

        if (!response.ok) {
            const payload = await response.text()
            const message = `Request failed with ${response.status} ${response.statusText}, ${payload}`;
            throw new Error(message);
        }

        return j
    }
    async getApplication(entityID: String): Promise<Application | undefined | URL > {

        const url = await this.discoveryApi.getBaseUrl('mta')
        const {token: idToken } = await this.identityApi.getCredentials();
        const ref = window.location.href
        

        const response = await fetch(url+"/application/entity/"+entityID, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(idToken && { Authorization: `Bearer ${idToken}` }),

            },
            //referrer: window.location.href,
            referrerPolicy: 'no-referrer-when-downgrade',
            redirect: 'error',
        });
        console.log(response.status)
        const j =  await response.json()
        if (response.status === 401) {
            // Create login pop-up
            console.log(j.loginURL)
            return new URL(j.loginURL)
        }
        if (response.status == 404) {
            return undefined;
        }

        if (!response.ok) {
            const payload = await response.text()
            const message = `Request failed with ${response.status} ${response.statusText}, ${payload}`;
            throw new Error(message);
        }

        return j
    }

    async saveApplicationEntity(applicationID: string, entityID: string): Promise<Application | URL> {
        console.log("here in save with application: " + applicationID)

        const url = await this.discoveryApi.getBaseUrl('mta')
        const {token: idToken } = await this.identityApi.getCredentials();
        const ref = window.location.href
        console.log("here in save with entity" + entityID + " application: " + applicationID)
        

        const response = await fetch(url+"/application/entity", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(idToken && { Authorization: `Bearer ${idToken}` }),

            },
            body: JSON.stringify({"applicationID": applicationID, "entityID": entityID}),
            //referrer: window.location.href,
            referrerPolicy: 'no-referrer-when-downgrade',
            redirect: 'error',
        });
        console.log(response.status)
        const j =  await response.json()
        if (response.status === 401) {
            // Create login pop-up
            console.log(j.loginURL)
            return new URL(j.loginURL)
        }

        if (!response.ok) {
            const message = `Request failed with ${response.status} ${response.statusText}, ${j}`;
            throw new Error(message);
        }

        return j
    }

    constructor(options: {
        discoveryApi: DiscoveryApi;
        identityApi: IdentityApi,
    }) {
        this.discoveryApi = options.discoveryApi
        this.identityApi = options.identityApi
    }

    getExample(): { example: string } {
        return { example: 'Hello World!' };
    }
}
