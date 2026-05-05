import {configurationChange, fetchPluginConfiguration} from '@/actions/config';
import {websocketHasVoted} from '@/actions/poll_metadata';

import {id as pluginId} from '@/manifest';
import reducer from '@/reducers';
import DefaultSettings from '@/components/admin_settings/default_settings';

export default class MatterVotePlugin {
    async initialize(registry, store) {
        await this.readPluginConfiguration(registry, store);
        registry.registerAdminConsoleCustomSetting('default_settings', DefaultSettings, {showTitle: true});

        registry.registerWebSocketEventHandler(
            'custom_' + pluginId + '_configuration_change',
            () => {
                store.dispatch(configurationChange(registry, store));
            },
        );
        registry.registerWebSocketEventHandler(
            'custom_' + pluginId + '_has_voted',
            (message) => {
                store.dispatch(websocketHasVoted(message.data));
            },
        );

        // When logging in, read plugin configuration from server.
        registry.registerWebSocketEventHandler('hello', async () => {
            await this.readPluginConfiguration(registry, store);
        });

        registry.registerReducer(reducer);
    }

    readPluginConfiguration = async (registry, store) => {
        // Always register the modern Mattervote post component, regardless of
        // the legacy ExperimentalUI flag. We still trigger a fetch so the
        // server config is loaded into Redux for other consumers.
        await fetchPluginConfiguration(store.getState())();
        store.dispatch(configurationChange(registry, store));
    };

    uninitialize() {
        //eslint-disable-next-line no-console
        console.log(pluginId + '::uninitialize()');
    }
}
