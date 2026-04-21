import type { Command } from "commander";
import {
  velaclawTeamAssetApproveCommand,
  velaclawTeamAssetBackfillItemsCommand,
  velaclawTeamAssetPromoteCommand,
  velaclawTeamAssetProposeCommand,
  velaclawTeamAssetRejectCommand,
  velaclawTeamAssetRebuildProjectionsCommand,
  velaclawTeamAssetsListCommand,
  velaclawTeamBackupCommand,
  velaclawTeamCreateCommand,
  velaclawTeamInvitationAcceptCommand,
  velaclawTeamInvitationCreateCommand,
  velaclawTeamInvitationRevokeCommand,
  velaclawTeamInvitationsListCommand,
  velaclawTeamMemberRemoveCommand,
  velaclawTeamMemberQuotaCommand,
  velaclawTeamMembersListCommand,
  velaclawTeamRestoreCommand,
  velaclawTeamsListCommand,
  velaclawTeamShowCommand,
} from "../../commands/velaclaw-team.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerTeamCommands(program: Command) {
  const team = program
    .command("team")
    .description("Manage Velaclaw teams, invitations, members, and shared assets");

  team
    .command("list")
    .description("List teams")
    .option("--root <dir>")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamsListCommand({ root: opts.root, json: Boolean(opts.json) });
      });
    });

  team
    .command("create")
    .description("Create a team")
    .requiredOption("--name <name>")
    .option("--slug <slug>")
    .option("--description <text>")
    .option("--manager-label <label>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamCreateCommand({
          root: opts.root,
          json: Boolean(opts.json),
          name: String(opts.name),
          slug: opts.slug,
          description: opts.description,
          managerLabel: opts.managerLabel,
        });
      });
    });

  team
    .command("show <slug>")
    .description("Show team summary")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamShowCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  const members = team.command("members").description("Manage team members");

  members
    .command("list <slug>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamMembersListCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  members
    .command("quota <slug> <memberId>")
    .description("Update member quota")
    .option("--role <role>")
    .option("--daily-messages <n>")
    .option("--monthly-messages <n>")
    .option("--status <state>", "active | paused")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, memberId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamMemberQuotaCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          memberId: String(memberId),
          role: opts.role,
          dailyMessages: opts.dailyMessages,
          monthlyMessages: opts.monthlyMessages,
          status: opts.status,
        });
      });
    });

  members
    .command("remove <slug> <memberId>")
    .description("Remove a member, stop its runtime, and delete its workspace")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, memberId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamMemberRemoveCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          memberId: String(memberId),
        });
      });
    });

  const invitations = team.command("invitations").description("Manage invitations");

  invitations
    .command("list <slug>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamInvitationsListCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  invitations
    .command("create <slug>")
    .requiredOption("--invitee-label <label>")
    .option("--member-id <id>")
    .option("--member-email <email>")
    .option("--role <role>")
    .option("--note <text>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamInvitationCreateCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          inviteeLabel: String(opts.inviteeLabel),
          memberId: opts.memberId,
          memberEmail: opts.memberEmail,
          role: opts.role,
          note: opts.note,
        });
      });
    });

  invitations
    .command("accept <code>")
    .option("--identity-name <name>")
    .option("--telegram-user-id <id>")
    .option("--telegram-bot-token <token>")
    .option("--telegram-bot-token-file <path>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (code, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamInvitationAcceptCommand({
          root: opts.root,
          json: Boolean(opts.json),
          code: String(code),
          identityName: opts.identityName,
          telegramUserId: opts.telegramUserId,
          telegramBotToken: opts.telegramBotToken,
          telegramBotTokenFile: opts.telegramBotTokenFile,
        });
      });
    });

  invitations
    .command("revoke <slug> <invitationId>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, invitationId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamInvitationRevokeCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          invitationId: String(invitationId),
        });
      });
    });

  const assets = team.command("assets").description("Manage shared assets");

  assets
    .command("list <slug>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetsListCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  assets
    .command("propose <slug>")
    .requiredOption(
      "--category <category>",
      "Asset type id (examples: shared-memory, shared-skills, shared-workflows, shared-docs, shared-tools)",
    )
    .requiredOption("--title <title>")
    .option("--content <text>")
    .option("--file <path>")
    .option("--submitted-by-member-id <id>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetProposeCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          category: String(opts.category),
          title: String(opts.title),
          content: opts.content,
          file: opts.file,
          submittedByMemberId: opts.submittedByMemberId,
        });
      });
    });

  assets
    .command("approve <slug> <assetId>")
    .option("--approved-by-member-id <id>", "", "manager")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, assetId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetApproveCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          assetId: String(assetId),
          approvedByMemberId: opts.approvedByMemberId,
        });
      });
    });

  assets
    .command("reject <slug> <assetId>")
    .option("--rejected-by-member-id <id>", "", "manager")
    .option("--reason <text>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, assetId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetRejectCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          assetId: String(assetId),
          rejectedByMemberId: opts.rejectedByMemberId,
          reason: opts.reason,
        });
      });
    });

  assets
    .command("promote <slug> <assetId>")
    .option("--actor-id <id>", "", "manager")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, assetId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetPromoteCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          assetId: String(assetId),
          actorId: opts.actorId,
        });
      });
    });

  assets
    .command("backfill-items <slug>")
    .description("Backfill canonical item-store files from existing asset projections")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetBackfillItemsCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  assets
    .command("rebuild-projections <slug>")
    .description(
      "Rebuild legacy current/collab/published projections from canonical item-store content",
    )
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamAssetRebuildProjectionsCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
        });
      });
    });

  team
    .command("backup <slug>")
    .description("Create a team backup archive")
    .option("--output <path>")
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (slug, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamBackupCommand({
          root: opts.root,
          json: Boolean(opts.json),
          slug: String(slug),
          output: opts.output,
        });
      });
    });

  team
    .command("restore <archive>")
    .description("Restore a team from a backup archive")
    .option("--force", "", false)
    .option("--root <dir>")
    .option("--json", "", false)
    .action(async (archive, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await velaclawTeamRestoreCommand({
          root: opts.root,
          json: Boolean(opts.json),
          archive: String(archive),
          force: Boolean(opts.force),
        });
      });
    });
}
