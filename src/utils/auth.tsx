import {
  AccountInfo, Configuration,
  InteractionRequiredAuthError,
  InteractionType, PublicClientApplication,
} from '@azure/msal-browser';
import { AuthenticationProvider, AuthenticationProviderOptions, Client } from '@microsoft/microsoft-graph-client';
import { usePlugin, useRunAsync } from '@remnote/plugin-sdk';

export const msalConfig: Configuration = {
  auth: {
    clientId: '',
    authority: 'https://login.microsoftonline.com/common',
    // TODO where should I redirect to?
    redirectUri: 'https://new.remnote.com/',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export class MsalAuthenticationProvider implements AuthenticationProvider {

  scopes: string[];
  msal: PublicClientApplication;

  constructor(authProviderOptions: AuthenticationProviderOptions, msal: PublicClientApplication) {
    this.scopes = authProviderOptions.scopes!;
    this.msal = msal;
  }

  getAccessToken() {
    return new Promise(async (resolve: (value: string) => void, reject) => {

      let response;
      let interactionRequired = true;

      const activeAccount = this.msal.getActiveAccount();
      // try silent token acquisition
      if (activeAccount) {
        try {
          response = await this.msal.acquireTokenSilent({
            account: activeAccount,
            scopes: this.scopes,
          });

          if (response.accessToken) {
            return resolve(response.accessToken);
          }

        } catch (error) {
          if (!(error instanceof InteractionRequiredAuthError)) {
            interactionRequired = false;
          }
        }
      }

      // fallback to popup method
      if (interactionRequired) {

        response = await this.msal.acquireTokenPopup({
          scopes: this.scopes
        });

        if (response.accessToken) {
          // set active account if success
          const allAccounts = this.msal.getAllAccounts();
          if (allAccounts.length >= 1) {
            this.msal.setActiveAccount(allAccounts[0]);
          }
          return resolve(response.accessToken);
        }
      }

      return reject(Error('Failed to acquire an access token'));
    });
  }
}