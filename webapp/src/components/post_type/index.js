import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUserId, getUsers} from 'mattermost-redux/selectors/entities/users';
import {getMissingProfilesByIds} from 'mattermost-redux/actions/users';

import {fetchPollMetadata} from '@/actions/poll_metadata';
import {voteAnswer} from '@/actions/vote';
import {pollMetadata} from '@/selector';

import PollPost from '@/components/post_type/post_type';

function mapStateToProps(state) {
    const config = getConfig(state);
    return {
        siteUrl: config.SiteURL,
        currentUserId: getCurrentUserId(state),
        usersById: getUsers(state),
        pollMetadata: pollMetadata(state),
    };
}

function mapDispatchToProps(dispatch) {
    return {
        actions: bindActionCreators({
            fetchPollMetadata,
            voteAnswer,
            getMissingProfilesByIds,
        }, dispatch),
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(PollPost);
