import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';

import type {UserProfile} from '@mattermost/types/users';

import PollPost from '@/components/post_type/post_type';
import type {AttachmentAction, PollMetadata, PollMetadataMap} from '@/types/poll';

describe('components/post_type/PollPost', () => {
    const pollId = 'poll_id';

    const actions: AttachmentAction[] = [
        {id: 'vote0', name: 'Yes'},
        {id: 'vote1', name: 'No'},
        {id: 'addOption', name: 'Add Option'},
        {id: 'resetVote', name: 'Reset Your Vote'},
        {id: 'endPoll', name: 'End Poll'},
        {id: 'deletePoll', name: 'Delete Poll'},
    ];

    const metadata: PollMetadata = {
        poll_id: pollId,
        user_id: 'user1',
        voted_answers: ['Yes'],
        can_manage_poll: false,
        option_answers: ['Yes', 'No'],
        option_voters: [['user1', 'user2', 'user3'], ['user4']],
    };

    const makeProps = (meta?: PollMetadata) => {
        const pollMetadata: PollMetadataMap = meta ? {[pollId]: meta} : {};
        return {
            post: {
                id: 'post_id',
                update_at: 1,
                props: {
                    poll_id: pollId,
                    attachments: [{
                        author_name: 'John Doe',
                        title: '📊 Lunch?',
                        text: '**Poll Settings**: progress',
                        actions,
                    }],
                },
            },
            theme: {buttonBg: '#1c58d9', buttonColor: '#ffffff'},
            siteUrl: 'http://localhost:8065',
            usersById: {user1: {id: 'user1', username: 'alice'} as UserProfile},
            pollMetadata,
            actions: {
                fetchPollMetadata: jest.fn(),
                voteAnswer: jest.fn(),
                getMissingProfilesByIds: jest.fn(),
            },
        };
    };

    test('should render the question, results and totals from the metadata', () => {
        render(<PollPost {...makeProps(metadata)}/>);

        expect(screen.getByText('Lunch?')).toBeInTheDocument();
        expect(screen.getByText('by John Doe')).toBeInTheDocument();
        expect(screen.getByTitle('Vote for Yes')).toHaveTextContent('✓Yes3');
        expect(screen.getByTitle('Vote for No')).toHaveTextContent('No1');
        expect(screen.getByText('75%')).toBeInTheDocument();
        expect(screen.getByText('25%')).toBeInTheDocument();
        expect(screen.getByText('4 votes')).toBeInTheDocument();
        expect(screen.getByText('4 voters')).toBeInTheDocument();
        expect(screen.getByText('progress')).toBeInTheDocument();
        expect(screen.getByTitle('alice')).toBeInTheDocument();
    });

    test('should render without options while the metadata is loading', () => {
        const props = makeProps();
        render(<PollPost {...props}/>);

        expect(screen.getByText('Lunch?')).toBeInTheDocument();
        expect(screen.getByText('0 votes')).toBeInTheDocument();
        expect(props.actions.fetchPollMetadata).toHaveBeenCalledWith('http://localhost:8065', pollId);
    });

    test('should vote and refetch the metadata when an option is clicked', async () => {
        const props = makeProps(metadata);
        render(<PollPost {...props}/>);
        props.actions.fetchPollMetadata.mockClear();

        fireEvent.click(screen.getByTitle('Vote for No'));

        expect(props.actions.voteAnswer).toHaveBeenCalledWith('post_id', 'vote1');
        await waitFor(() => expect(props.actions.fetchPollMetadata).toHaveBeenCalledWith('http://localhost:8065', pollId));
    });

    test('should load profiles of voters that are not in the store yet', async () => {
        const props = makeProps(metadata);
        render(<PollPost {...props}/>);

        await waitFor(() => expect(props.actions.getMissingProfilesByIds).toHaveBeenCalledWith(['user2', 'user3', 'user4']));
    });

    test('should hide voter avatars for anonymous polls', () => {
        render(<PollPost {...makeProps({...metadata, setting_anonymous: true, option_voters: [[], []], option_answers: ['Yes', 'No']})}/>);

        expect(screen.queryByTitle('alice')).not.toBeInTheDocument();
        expect(screen.getByText('0 votes')).toBeInTheDocument();
    });

    test('should show the management buttons only to users who can manage the poll', () => {
        const {rerender} = render(<PollPost {...makeProps(metadata)}/>);

        expect(screen.getByText('Reset Your Vote')).toBeInTheDocument();
        expect(screen.queryByText('Add Option')).not.toBeInTheDocument();
        expect(screen.queryByText('End Poll')).not.toBeInTheDocument();
        expect(screen.queryByText('Delete Poll')).not.toBeInTheDocument();

        rerender(<PollPost {...makeProps({...metadata, can_manage_poll: true})}/>);

        expect(screen.getByText('Add Option')).toBeInTheDocument();
        expect(screen.getByText('End Poll')).toBeInTheDocument();
        expect(screen.getByText('Delete Poll')).toBeInTheDocument();
    });
});
