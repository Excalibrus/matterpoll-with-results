import {id as pluginId} from '@/manifest';
import ActionTypes from '@/action_types';

export const websocketHasVoted = (data) => async (dispatch, getState) => {
    // Merge into any existing entry so we don't drop option_voters/option_answers
    // that the GET metadata endpoint populated.
    const existing = (getState()['plugins-' + pluginId] && getState()['plugins-' + pluginId].pollMetadata && getState()['plugins-' + pluginId].pollMetadata[data.poll_id]) || {};
    return dispatch({
        type: ActionTypes.FETCH_POLL_METADATA,
        data: {
            ...existing,
            voted_answers: data.voted_answers,
            user_id: data.user_id,
            poll_id: data.poll_id,
            can_manage_poll: data.can_manage_poll,
            setting_progress: data.setting_progress,
            setting_public_add_option: data.setting_public_add_option,
        },
    });
};

export const fetchPollMetadata = (siteUrl, pollId) => async (dispatch) => {
    if (!pollId) {
        return;
    }

    let url = siteUrl.replace(/\/?$/, '');
    url = `${url}/plugins/${pluginId}/api/v1/polls/${pollId}/metadata`;

    try {
        const resp = await fetch(url);
        dispatch({
            type: ActionTypes.FETCH_POLL_METADATA,
            data: await resp.json(),
        });
    } catch (err) {
        //eslint-disable-next-line no-console
        console.log('failed to fetch metadata: ', err);
    }
};
