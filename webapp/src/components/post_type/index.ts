import {connect} from 'react-redux';
import {bindActionCreators, type Dispatch} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getMissingProfilesByIds} from 'mattermost-redux/actions/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUserId, getUsers} from 'mattermost-redux/selectors/entities/users';

import {fetchPollMetadata} from '@/actions/poll_metadata';
import {voteAnswer} from '@/actions/vote';
import PostType from '@/components/post_type/post_type';
import {pollMetadata} from '@/selector';

function mapStateToProps(state: GlobalState) {
    const config = getConfig(state);
    return {
        siteUrl: config.SiteURL ?? '',
        currentUserId: getCurrentUserId(state),
        usersById: getUsers(state),
        pollMetadata: pollMetadata(state),
    };
}

function mapDispatchToProps(dispatch: Dispatch) {
    return {
        actions: bindActionCreators({
            fetchPollMetadata,
            voteAnswer,
            getMissingProfilesByIds,
        }, dispatch),
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(PostType);
