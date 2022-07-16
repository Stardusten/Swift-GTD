import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalAuthenticationProvider, msalConfig } from '../utils/auth';
import { Client } from '@microsoft/microsoft-graph-client';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: 'clientID',
    title: 'Application (client) ID',
    defaultValue: ''
  });

  await plugin.app.registerCommand({
    id: 'syncAllTasks',
    name: 'Sync All Tasks',
    quickCode: 'sat',
    action: async () => {

      const clientId = await plugin.settings.getSetting('clientID') as string;

      if (clientId == '') {
        await plugin.app.toast('Please specify clientID in plugin setting first!');
        return;
      }

      msalConfig.auth.clientId = clientId;
      const msal = new PublicClientApplication(msalConfig);

      const authProvider = new MsalAuthenticationProvider({
        scopes: ["Mail.Read"] // TODO
      }, msal);

      const graphClient = Client.initWithMiddleware({ authProvider });

      // test fetch
      graphClient.api('/me/messages').get()
        .then((response) => alert(JSON.stringify(response)))
        .catch((error) => alert(error));
    }
  })
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
