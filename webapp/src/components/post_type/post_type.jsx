import React from 'react';
import PropTypes from 'prop-types';
import styled, {keyframes} from 'styled-components';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

const MAX_AVATARS = 5;

export default class PollPost extends React.PureComponent {
    static propTypes = {
        post: PropTypes.object.isRequired,
        theme: PropTypes.object.isRequired,
        currentUserId: PropTypes.string,
        siteUrl: PropTypes.string,
        usersById: PropTypes.object,
        pollMetadata: PropTypes.object,
        actions: PropTypes.shape({
            fetchPollMetadata: PropTypes.func.isRequired,
            voteAnswer: PropTypes.func.isRequired,
            getMissingProfilesByIds: PropTypes.func,
        }).isRequired,
    };

    componentDidMount() {
        this.refresh();
    }

    componentDidUpdate(prevProps) {
        // Refetch metadata when the post itself updates (e.g. another user voted),
        // or when our cached metadata for this poll changes voter membership.
        if (prevProps.post.update_at === this.props.post.update_at) {
            this.ensureProfilesLoaded();
        } else {
            this.refresh();
        }
    }

    refresh() {
        const pollId = this.props.post.props.poll_id;
        if (!pollId) {
            return;
        }
        const siteUrl = this.props.siteUrl || '';
        Promise.resolve(this.props.actions.fetchPollMetadata(siteUrl, pollId)).then(() => {
            this.ensureProfilesLoaded();
        });
    }

    ensureProfilesLoaded() {
        const meta = this.metadata();
        if (!meta || !meta.option_voters || !this.props.actions.getMissingProfilesByIds) {
            return;
        }
        const ids = new Set();
        meta.option_voters.forEach((list) => (list || []).forEach((id) => ids.add(id)));
        const missing = [...ids].filter((id) => !this.props.usersById || !this.props.usersById[id]);
        if (missing.length > 0) {
            this.props.actions.getMissingProfilesByIds(missing);
        }
    }

    metadata() {
        const map = this.props.pollMetadata || {};
        return map[this.props.post.props.poll_id];
    }

    handleVote = async (actionId) => {
        // Fire the vote action and then proactively refetch metadata. We can't
        // rely on componentDidUpdate noticing post.update_at because the
        // returned PostActionIntegrationResponse.Update may not bump it for the
        // local user, and the websocket "has_voted" event is best-effort.
        await this.props.actions.voteAnswer(this.props.post.id, actionId);
        this.refresh();
    };

    findVoteAction(index) {
        const attachment = (this.props.post.props.attachments || [])[0] || {};
        const actions = attachment.actions || [];
        const id = `vote${index}`;
        return actions.find((a) => a.id === id);
    }

    findManagementAction(id) {
        const attachment = (this.props.post.props.attachments || [])[0] || {};
        const actions = attachment.actions || [];
        return actions.find((a) => a.id === id);
    }

    render() {
        const {post, theme} = this.props;
        const attachment = (post.props.attachments || [])[0] || {};
        const meta = this.metadata();

        const question = (attachment.title || '').replace(/^📊 /, '');
        const author = attachment.author_name;

        const optionAnswers = (meta && meta.option_answers) || [];
        const optionVoters = (meta && meta.option_voters) || [];
        const anonymous = Boolean(meta && meta.setting_anonymous);
        const votedAnswers = (meta && meta.voted_answers) || [];
        const canManage = Boolean(meta && meta.can_manage_poll);

        // Compute counts and totals
        const counts = optionAnswers.map((_, i) => (optionVoters[i] || []).length);
        const totalVotes = counts.reduce((a, b) => a + b, 0);
        const maxCount = counts.reduce((m, c) => (c > m ? c : m), 0);
        const totalVoters = new Set();
        optionVoters.forEach((list) => (list || []).forEach((id) => totalVoters.add(id)));

        const usersById = this.props.usersById || {};

        const optionRows = optionAnswers.map((answer, i) => {
            const voters = optionVoters[i] || [];
            const count = counts[i];
            const sharePct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            const totalPct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isLeader = count > 0 && count === maxCount;
            const youVoted = votedAnswers.indexOf(answer) >= 0;
            const action = this.findVoteAction(i);

            return (
                <OptionRow key={`opt-${i}`}>
                    <OptionHeader>
                        <Pill
                            type='button'
                            isVoted={youVoted}
                            primary={theme.buttonBg || '#1c58d9'}
                            primaryText={theme.buttonColor || '#ffffff'}
                            disabled={!action}
                            onClick={() => action && this.handleVote(action.id)}
                            title={action ? `Vote for ${answer}` : answer}
                        >
                            {youVoted && <Check>{'✓'}</Check>}
                            <span>{answer}</span>
                            <CountBadge isVoted={youVoted}>{count}</CountBadge>
                        </Pill>
                        <Percent>{`${totalPct}%`}</Percent>
                    </OptionHeader>
                    <BarTrack>
                        <BarFill
                            style={{width: `${sharePct}%`}}
                            isLeader={isLeader}
                            primary={theme.buttonBg || '#1c58d9'}
                        />
                    </BarTrack>
                    {!anonymous && voters.length > 0 && (
                        <AvatarRow>
                            {voters.slice(0, MAX_AVATARS).map((id, idx) => {
                                const u = usersById[id];
                                const name = (u && (u.username || u.first_name)) || id;
                                const url = this.profileUrl(id, u);
                                return (
                                    <Avatar
                                        key={`${id}-${idx}`}
                                        title={name}
                                        style={{backgroundImage: `url("${url}")`, zIndex: MAX_AVATARS - idx}}
                                    />
                                );
                            })}
                            {voters.length > MAX_AVATARS && (
                                <MoreAvatars title={voters.slice(MAX_AVATARS).map((id) => (usersById[id] && usersById[id].username) || id).join(', ')}>
                                    {`+${voters.length - MAX_AVATARS}`}
                                </MoreAvatars>
                            )}
                        </AvatarRow>
                    )}
                </OptionRow>
            );
        });

        const settingsText = this.parseSettings(attachment.text || '');

        return (
            <Card accent={theme.buttonBg || '#1c58d9'}>
                <Header>
                    <Title>
                        <span
                            role='img'
                            aria-label='poll'
                        >{'📊'}</span>
                        <span>{question || 'Poll'}</span>
                    </Title>
                    {author ? <ByLine>{`by ${author}`}</ByLine> : null}
                </Header>

                <Options>{optionRows}</Options>

                <Footer>
                    <FooterMeta>
                        <span>{`${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`}</span>
                        <span>{'·'}</span>
                        <span>{`${totalVoters.size} ${totalVoters.size === 1 ? 'voter' : 'voters'}`}</span>
                        {settingsText && <><span>{'·'}</span><span>{settingsText}</span></>}
                    </FooterMeta>
                    <FooterButtons>
                        {this.renderManageButton('addOption', canManage || (meta && meta.setting_public_add_option))}
                        {this.renderManageButton('resetVote', true)}
                        {this.renderManageButton('endPoll', canManage)}
                        {this.renderManageButton('deletePoll', canManage, true)}
                    </FooterButtons>
                </Footer>
            </Card>
        );
    }

    profileUrl(userId, user) {
        const base = (this.props.siteUrl || '').replace(/\/?$/, '');
        const cacheBust = user && user.last_picture_update ? `?_=${user.last_picture_update}` : '';
        return `${base}/api/v4/users/${userId}/image${cacheBust}`;
    }

    parseSettings(text) {
        // The server still includes a "**Poll Settings**: ..." line in the
        // attachment text. Pull just the value out so we can render it inline.
        const match = text.match(/\*\*Poll Settings\*\*:\s*([^\n]+)/);
        return match ? match[1] : '';
    }

    renderManageButton(actionId, enabled, danger = false) {
        const action = this.findManagementAction(actionId);
        if (!action || !enabled) {
            return null;
        }
        return (
            <ManageBtn
                key={actionId}
                type='button'
                danger={danger}
                onClick={() => this.handleVote(action.id)}
            >
                {action.name}
            </ManageBtn>
        );
    }
}

// ----- styled-components -----

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const Card = styled.div`
    border-radius: 12px;
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    background: var(--center-channel-bg, #fff);
    overflow: hidden;
    position: relative;
    padding: 16px 20px 12px 20px;
    margin: 4px 0;
    animation: ${fadeIn} 200ms ease-out;
    &:before {
        content: '';
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 4px;
        background: ${({accent}) => accent};
        border-radius: 4px 0 0 4px;
    }
`;

const Header = styled.div`
    margin-bottom: 14px;
`;

const Title = styled.div`
    font-size: 15px;
    font-weight: 600;
    color: var(--center-channel-color, #3d3c40);
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ByLine = styled.div`
    font-size: 12px;
    color: rgba(63,67,80,0.64);
    margin-top: 2px;
`;

const Options = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const OptionRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const OptionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const Pill = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1.5px solid ${({primary, isVoted}) => (isVoted ? primary : changeOpacity(primary, 0.3))};
    background: ${({primary, isVoted}) => (isVoted ? primary : 'transparent')};
    color: ${({primary, primaryText, isVoted}) => (isVoted ? primaryText : primary)};
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease-out;
    max-width: 70%;
    text-align: left;
    &:hover:not(:disabled) {
        background: ${({primary, isVoted}) => (isVoted ? primary : changeOpacity(primary, 0.08))};
        transform: translateY(-1px);
    }
    &:active:not(:disabled) {
        transform: translateY(0);
    }
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    span:nth-child(2) {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

const Check = styled.span`
    font-weight: 700;
`;

const CountBadge = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 700;
    background: ${({isVoted}) => (isVoted ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)')};
`;

const Percent = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: rgba(63,67,80,0.64);
    min-width: 36px;
    text-align: right;
`;

const BarTrack = styled.div`
    height: 6px;
    border-radius: 3px;
    background: rgba(0,0,0,0.06);
    overflow: hidden;
`;

const BarFill = styled.div`
    height: 100%;
    border-radius: 3px;
    background: ${({primary, isLeader}) => (isLeader ? primary : changeOpacity(primary, 0.45))};
    transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms ease-out;
`;

const AvatarRow = styled.div`
    display: flex;
    align-items: center;
    margin-top: 4px;
    padding-left: 4px;
`;

const Avatar = styled.div`
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background-color: rgba(0,0,0,0.08);
    background-size: cover;
    background-position: center;
    border: 2px solid var(--center-channel-bg, #fff);
    margin-left: -6px;
    &:first-child { margin-left: 0; }
`;

const MoreAvatars = styled.div`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    min-width: 22px;
    padding: 0 6px;
    margin-left: -6px;
    border-radius: 11px;
    background: rgba(0,0,0,0.08);
    color: rgba(63,67,80,0.72);
    font-size: 10px;
    font-weight: 700;
    border: 2px solid var(--center-channel-bg, #fff);
`;

const Footer = styled.div`
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
`;

const FooterMeta = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(63,67,80,0.6);
`;

const FooterButtons = styled.div`
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
`;

const ManageBtn = styled.button`
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.12);
    background: transparent;
    color: ${({danger}) => (danger ? '#d24b4e' : 'rgba(63,67,80,0.72)')};
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease-out;
    &:hover {
        background: ${({danger}) => (danger ? 'rgba(210,75,78,0.08)' : 'rgba(0,0,0,0.04)')};
    }
`;

