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
        
        const response = await fetch(url+"/applications", {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(idToken && { Authorization: `Bearer ${idToken}` }),
            },
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
