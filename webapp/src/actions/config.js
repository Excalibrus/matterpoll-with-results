import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import ActionTypes from '@/action_types';
import PostType from '@/components/post_type';
import Client from '@/client';
import {postTypeComponent} from '@/selector';

export const configurationChange = (registry, store) => async (dispatch) => {
    // Always register the custom Mattervote post type — the modern poll card is
    // not gated behind ExperimentalUI in this fork.
    let registeredComponentId = postTypeComponent(store.getState()) ? postTypeComponent(store.getState()).id : '';
    if (!registeredComponentId) {
        registeredComponentId = registry.registerPostTypeComponent('custom_matterpoll', PostType);
    }
    return dispatch({
        type: ActionTypes.REGISTER_POST_TYPE_COMPONENT_ID,
        data: {postTypeComponentId: registeredComponentId},
    });
};

export const fetchPluginConfiguration = (state) => {
    return async () => {
        const currentUserId = getCurrentUserId(state);
        if (currentUserId) {
            return Client.getPluginConfiguration();
        }
        return null;
    };
};
