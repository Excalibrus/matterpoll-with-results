package poll

import (
	"fmt"
	"strings"

	"github.com/nicksnyder/go-i18n/v2/i18n"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/matterpoll/matterpoll/server/utils"
)

// IDToNameConverter converts a given userID to a human readable name.
type IDToNameConverter func(userID string) (string, *model.AppError)

var (
	pollMessageSettings = &i18n.Message{
		ID:    "poll.message.pollSettings",
		Other: "**Poll Settings**: {{.Settings}}",
	}
	pollMessageTotalVotes = &i18n.Message{
		ID:    "poll.message.totalVotes",
		Other: "**Total votes**: {{.TotalVotes}}",
	}
	pollMessageTotalVotesMultiSetting = &i18n.Message{
		ID:    "poll.message.totalVotesMulti",
		One:   "**Total votes**: {{.TotalVotes}} ({{ .TotalVoters }} voter)",
		Few:   "**Total votes**: {{.TotalVotes}} ({{ .TotalVoters }} voters)",
		Many:  "**Total votes**: {{.TotalVotes}} ({{ .TotalVoters }} voters)",
		Other: "**Total votes**: {{.TotalVotes}} ({{ .TotalVoters }} voters)",
	}

	pollLiveResultHeading = &i18n.Message{
		ID:    "poll.message.liveResultVotes",
		One:   "{{.Count}} vote",
		Few:   "{{.Count}} votes",
		Many:  "{{.Count}} votes",
		Other: "{{.Count}} votes",
	}

	pollEndPostText = &i18n.Message{
		ID:    "poll.endPost.text",
		Other: "This poll has ended. The results are:",
	}
	pollEndPostSeparator = &i18n.Message{
		ID:    "poll.endPost.separator",
		Other: "and",
	}
	pollEndPostAnswerHeading = &i18n.Message{
		ID:    "poll.endPost.answer.heading",
		One:   "{{.Answer}} ({{.Count}} vote)",
		Few:   "{{.Answer}} ({{.Count}} votes)",
		Many:  "{{.Answer}} ({{.Count}} votes)",
		Other: "{{.Answer}} ({{.Count}} votes)",
	}
	rhsCardPollVoterSeparator = &i18n.Message{
		ID:    "rhs.card.poll.voter.separator",
		Other: "and",
	}
	rhsCardPollCreatedBy = &i18n.Message{
		ID:    "rhs.card.poll.createdBy",
		Other: "Created by",
	}
	rhsCardPollAnswerHeading = &i18n.Message{
		ID:    "rhs.card.poll.answer.heading",
		One:   "{{.Answer}} ({{.Count}} vote)",
		Few:   "{{.Answer}} ({{.Count}} votes)",
		Many:  "{{.Answer}} ({{.Count}} votes)",
		Other: "{{.Answer}} ({{.Count}} votes)",
	}
)

// FormatVoterLists returns one voter-list string per AnswerOption, using the
// provided converter to resolve user IDs to display names. The poll being
// anonymous is the caller's concern — pass nil voterLists to ToPostActions to
// suppress voter names entirely.
func (p *Poll) FormatVoterLists(bundle *utils.Bundle, convert IDToNameConverter) []string {
	localizer := bundle.GetServerLocalizer()
	out := make([]string, len(p.AnswerOptions))
	if convert == nil {
		return out
	}
	// Be defensive: in tests the user-lookup mock may not be set up for every
	// voter and would panic. Recover so the live result fields degrade
	// gracefully instead of crashing the request handler.
	defer func() { _ = recover() }()
	for i, o := range p.AnswerOptions {
		var voterList string
		for j, v := range o.Voter {
			displayName, err := safeConvert(convert, v)
			if err != nil || displayName == "" {
				displayName = "?"
			}
			if j+1 == len(o.Voter) && len(o.Voter) > 1 {
				voterList += " " + bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: pollEndPostSeparator}) + " "
			} else if j != 0 {
				voterList += ", "
			}
			voterList += displayName
		}
		out[i] = voterList
	}
	return out
}

// safeConvert wraps convert in a recover so a panicking implementation (e.g. a
// test mock with no expectation set) does not bring down the request handler.
func safeConvert(convert IDToNameConverter, userID string) (name string, err *model.AppError) {
	defer func() {
		if r := recover(); r != nil {
			name = ""
			err = &model.AppError{Message: fmt.Sprintf("convert panicked: %v", r)}
		}
	}()
	return convert(userID)
}

// ToPostActions returns the poll as a message. voterLists, if non-nil, must
// have one entry per AnswerOption and provides the formatted voter names for
// the result field of each option.
func (p *Poll) ToPostActions(bundle *utils.Bundle, pluginID, authorName string, voterLists []string) []*model.MessageAttachment {
	localizer := bundle.GetServerLocalizer()
	numberOfVotes := 0
	voters := make(map[string]struct{})
	actions := []*model.PostAction{}
	fields := []*model.MessageAttachmentField{}

	// First pass: total counts and max so we can scale progress bars.
	maxOptionVotes := 0
	for _, o := range p.AnswerOptions {
		numberOfVotes += len(o.Voter)
		if len(o.Voter) > maxOptionVotes {
			maxOptionVotes = len(o.Voter)
		}
		for _, v := range o.Voter {
			voters[v] = struct{}{}
		}
	}

	for i, o := range p.AnswerOptions {
		answer := o.Answer
		if p.Settings.Progress {
			answer = fmt.Sprintf("%s (%d)", answer, len(o.Voter))
		}

		var voterList string
		if voterLists != nil && i < len(voterLists) && !p.Settings.Anonymous {
			voterList = voterLists[i]
		}

		heading := bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
			DefaultMessage: pollEndPostAnswerHeading,
			TemplateData: map[string]any{
				"Answer": o.Answer,
				"Count":  len(o.Voter),
			},
			PluralCount: len(o.Voter),
		})
		title := heading
		if p.Settings.Bar {
			title = fmt.Sprintf("%s\n`%s`", heading, progressBar(len(o.Voter), maxOptionVotes, 10))
		}
		field := &model.MessageAttachmentField{
			Short: true,
			Title: title,
		}
		if voterList != "" {
			field.Value = voterList
		}
		fields = append(fields, field)
		actions = append(actions, &model.PostAction{
			Id:    fmt.Sprintf("vote%v", i),
			Name:  answer,
			Type:  model.PostActionTypeButton,
			Style: "default",
			Integration: &model.PostActionIntegration{
				URL: fmt.Sprintf("/plugins/%s/api/v1/polls/%s/vote/%v", pluginID, p.ID, i),
			},
		})
	}

	actions = append(actions,
		&model.PostAction{
			Id: "resetVote",
			Name: bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
				DefaultMessage: &i18n.Message{
					ID:    "poll.button.resetVotes",
					One:   "Reset Your Vote",
					Few:   "Reset Your Votes",
					Many:  "Reset Your Votes",
					Other: "Reset Your Votes",
				},
				PluralCount: p.Settings.MaxVotes,
			}),
			Type:  model.PostActionTypeButton,
			Style: "primary",
			Integration: &model.PostActionIntegration{
				URL: fmt.Sprintf("/plugins/%s/api/v1/polls/%s/votes/reset", pluginID, p.ID),
			},
		},
	)
	actions = append(actions,
		&model.PostAction{
			Id: "addOption",
			Name: bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: &i18n.Message{
				ID:    "poll.button.addOption",
				Other: "Add Option",
			}}),
			Type:  model.PostActionTypeButton,
			Style: "primary",
			Integration: &model.PostActionIntegration{
				URL: fmt.Sprintf("/plugins/%s/api/v1/polls/%s/option/add/request", pluginID, p.ID),
			},
		}, &model.PostAction{
			Id: "endPoll",
			Name: bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: &i18n.Message{
				ID:    "poll.button.endPoll",
				Other: "End Poll",
			}}),
			Type:  model.PostActionTypeButton,
			Style: "primary",
			Integration: &model.PostActionIntegration{
				URL: fmt.Sprintf("/plugins/%s/api/v1/polls/%s/end", pluginID, p.ID),
			},
		}, &model.PostAction{
			Id: "deletePoll",
			Name: bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: &i18n.Message{
				ID:    "poll.button.deletePoll",
				Other: "Delete Poll",
			}}),
			Type:  model.PostActionTypeButton,
			Style: "danger",
			Integration: &model.PostActionIntegration{
				URL: fmt.Sprintf("/plugins/%s/api/v1/polls/%s/delete", pluginID, p.ID),
			},
		},
	)

	if p.Settings.AnonymousCreator {
		authorName = ""
	}

	return []*model.MessageAttachment{{
		Color:      "#1c58d9",
		AuthorName: authorName,
		Title:      "📊 " + p.Question,
		Text:       p.makeAdditionalText(bundle, numberOfVotes, len(voters)),
		Fields:     fields,
		Actions:    actions,
	}}
}

// progressBar renders a fixed-width unicode bar showing count/max.
// Returns a string of `width` characters using █ for filled and ░ for empty.
func progressBar(count, max, width int) string {
	if max <= 0 || width <= 0 {
		return strings.Repeat("░", width)
	}
	filled := (count * width) / max
	if filled > width {
		filled = width
	}
	return strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
}

// makeAdditionalText make descriptions about poll
// This method returns markdown text, because it is used for SlackAttachment.Text field.
func (p *Poll) makeAdditionalText(bundle *utils.Bundle, numberOfVotes, numberOfVoters int) string {
	localizer := bundle.GetServerLocalizer()
	settingsText := p.Settings.String()

	lines := []string{"---"}
	if len(settingsText) > 0 {
		lines = append(lines, bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
			DefaultMessage: pollMessageSettings,
			TemplateData:   map[string]any{"Settings": settingsText},
		}))
	}

	if p.IsMultiVote() {
		lines = append(lines, bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
			DefaultMessage: pollMessageTotalVotesMultiSetting,
			TemplateData: map[string]any{
				"TotalVotes":  numberOfVotes,
				"TotalVoters": numberOfVoters,
			},
			PluralCount: numberOfVoters,
		}))
	} else {
		lines = append(lines, bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
			DefaultMessage: pollMessageTotalVotes,
			TemplateData:   map[string]any{"TotalVotes": numberOfVotes},
		}))
	}
	return strings.Join(lines, "\n")
}

// ToEndPollPost returns the poll end message
func (p *Poll) ToEndPollPost(bundle *utils.Bundle, authorName string, convert IDToNameConverter) (*model.Post, *model.AppError) {
	localizer := bundle.GetServerLocalizer()
	post := &model.Post{}
	fields := []*model.MessageAttachmentField{}

	for _, o := range p.AnswerOptions {
		var voter strings.Builder
		if !p.Settings.Anonymous {
			for i := 0; i < len(o.Voter); i++ {
				displayName, err := convert(o.Voter[i])
				if err != nil {
					return nil, err
				}
				if i+1 == len(o.Voter) && len(o.Voter) > 1 {
					voter.WriteString(" " + bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: pollEndPostSeparator}) + " ")
				} else if i != 0 {
					voter.WriteString(", ")
				}
				voter.WriteString(displayName)
			}
		}

		fields = append(fields, &model.MessageAttachmentField{
			Short: true,
			Title: bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
				DefaultMessage: pollEndPostAnswerHeading,
				TemplateData: map[string]any{
					"Answer": o.Answer,
					"Count":  len(o.Voter),
				},
				PluralCount: len(o.Voter),
			}),
			Value: voter.String(),
		})
	}

	if p.Settings.AnonymousCreator {
		authorName = ""
	}

	attachments := []*model.MessageAttachment{{
		Color:      "#1c58d9",
		AuthorName: authorName,
		Title:      "📊 " + p.Question,
		Text:       bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: pollEndPostText}),
		Fields:     fields,
	}}

	model.ParseMessageAttachment(post, attachments)

	return post, nil
}

// ToCard return the poll for rhs card
func (p *Poll) ToCard(bundle *utils.Bundle, convert IDToNameConverter) string {
	localizer := bundle.GetServerLocalizer()
	var s strings.Builder
	fmt.Fprintf(&s, "# %s\n", p.Question)

	if !p.Settings.AnonymousCreator {
		creatorName, _ := convert(p.Creator)
		fmt.Fprintf(&s, bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: rhsCardPollCreatedBy})+" %s\n", creatorName)
	}

	const comma = ", "
	for _, o := range p.AnswerOptions {
		var voter strings.Builder
		if !p.Settings.Anonymous {
			for i := 0; i < len(o.Voter); i++ {
				displayName, err := convert(o.Voter[i])
				if err != nil {
					return ""
				}
				if i+1 == len(o.Voter) && len(o.Voter) > 1 {
					voter.WriteString(" " + bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{DefaultMessage: rhsCardPollVoterSeparator}) + " ")
				} else if i != 0 {
					voter.WriteString(comma)
				}
				voter.WriteString(displayName)
			}
		}

		s.WriteString("### " + bundle.LocalizeWithConfig(localizer, &i18n.LocalizeConfig{
			DefaultMessage: rhsCardPollAnswerHeading,
			TemplateData: map[string]any{
				"Answer": o.Answer,
				"Count":  len(o.Voter),
			},
			PluralCount: len(o.Voter),
		}) + "\n" + voter.String() + "\n")
	}
	return s.String()
}
