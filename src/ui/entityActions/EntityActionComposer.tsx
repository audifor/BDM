import { useEffect } from "react";

import { getComposerOptions } from "@/app/entityActions/ComposerEngine";
import { createActionSignature, resolveQuickActions } from "@/app/entityActions/QuickActions";
import { productionEntityActionRegistry } from "@/app/entityActions/productionRegistry";
import type { CommandResult } from "@/app/entityActions/EntityCommand";
import type { PlayerId } from "@/domain/ids";
import { useEntityActionComposerStore } from "@/stores/entityActionComposerStore";
import { useEntityActionUsageStore } from "@/stores/entityActionUsageStore";

export function EntityActionComposer({
  onResult,
}: {
  readonly onResult: (result: CommandResult) => {
    readonly kind: string;
    readonly reason?: string;
  };
}) {
  const state = useEntityActionComposerStore();
  const preferences = useEntityActionUsageStore((usage) => usage.preferences);
  const recordUsage = useEntityActionUsageStore((usage) => usage.record);
  const {
    close,
    cancel,
    chooseAction,
    chooseQuickAction,
    selectOption,
    confirm,
    back,
    setMessage,
  } = state;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.mode !== "closed") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, state.mode]);
  useEffect(() => {
    if (state.mode !== "result" || state.result === null) return;
    const outcome = onResult(state.result);
    if (outcome.kind === "rejected") {
      setMessage(outcome.reason ?? "Action was rejected");
      return;
    }
    if (outcome.kind === "noExecutor") {
      setMessage("This action is not available yet");
      return;
    }
    if (outcome.kind === "handoffProduced") {
      setMessage("This action is ready for its future destination");
      return;
    }
    if (outcome.kind === "executed" && state.composition !== null && (state.composition.status === "completed" || state.composition.status === "handedOff")) recordUsage(createActionSignature(state.entity!.type, state.composition.action, state.composition));
    close();
  }, [close, onResult, recordUsage, setMessage, state.composition, state.entity, state.mode, state.result]);
  if (
    state.mode === "closed" ||
    state.entity === null ||
    state.environment === null
  )
    return null;
  const anchor = state.anchor;
  if (anchor === null) return null;
  const player =
    state.entity.type === "player"
      ? state.environment.world.players[state.entity.id as PlayerId]
      : undefined;
  const title =
    player === undefined
      ? state.entity.id
      : `${player.firstName} ${player.lastName}`;
  const entityPrefix = `entityActions.${state.entity.type}.`;
  const actions = productionEntityActionRegistry.getActions(
    state.entity,
    state.environment,
  );
  const quickActions = resolveQuickActions(state.entity, state.environment, productionEntityActionRegistry, preferences);
  const composition = state.composition;
  const options =
    composition?.status === "selecting" ? getComposerOptions(composition) : [];
  const crumb =
    composition?.status === "selecting" ||
    composition?.status === "readyToConfirm"
      ? [
          composition.action.labelKey,
          ...composition.draft.selections.map((selection) =>
            String(selection.value),
          ),
        ].join(" › ")
      : "";
  const canBack =
    composition !== null &&
    (composition.status === "selecting" ||
      composition.status === "readyToConfirm") &&
    composition.path.length > 1;
  const isQuickBoard = state.mode === "quick";
  const panelWidth = isQuickBoard ? 448 : 784;
  const panelHeight = isQuickBoard ? 330 : 600;
  return (
    <div
      className="entity-action-composer__backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
    <section
      aria-label={`Actions for ${title}`}
      aria-modal="true"
      className={`entity-action-composer${isQuickBoard ? " entity-action-composer--quick" : ""}`}
      role="dialog"
      style={{
        left: `clamp(24px, ${anchor.x}px, calc(100vw - ${panelWidth}px))`,
        top: `clamp(24px, ${anchor.y}px, calc(100vh - ${panelHeight}px))`,
      }}
      >
        <header>
          <div>
            <p className="eyebrow">{state.entity.type.toUpperCase()} ACTIONS</p>
            <h2>{title}</h2>
            {player !== undefined && (
              <p>{player.basketball.primaryPosition} · PLAYER</p>
            )}
          </div>
          <button
            aria-label="Close actions"
            className="text-button"
            onClick={cancel}
            type="button"
          >
            CANCEL
          </button>
        </header>
        {state.mode === "board" ? (
          <div className="entity-action-composer__grid">
            {actions.map(({ definition, availability }) => (
              <button
                aria-describedby={
                  availability.kind === "disabled"
                    ? `${definition.id}-reason`
                    : undefined
                }
                className="entity-action-composer__root"
                aria-disabled={availability.kind === "disabled"}
                key={definition.id}
                onClick={() => { if (availability.kind === "enabled") chooseAction(definition.id); }}
                title={definition.descriptionKey}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="entity-action-composer__icon"
                >
                  {definition.iconKey?.slice(0, 1).toUpperCase()}
                </span>
                <strong>
                  {definition.labelKey
                    .replace(entityPrefix, "")
                    .toUpperCase()}
                </strong>
                {availability.kind === "disabled" && (
                  <small id={`${definition.id}-reason`}>
                    {availability.reason}
                  </small>
                )}
              </button>
            ))}
          </div>
        ) : state.mode === "quick" ? (
          <div className="entity-action-composer__quick-grid">
            {quickActions.map((quick) => {
              const action = actions.find((candidate) => candidate.definition.id === quick.signature.rootActionId);
              const availability = action?.availability;
              return <button aria-describedby={availability?.kind === "disabled" ? `${quick.signature.rootActionId}-reason` : undefined} aria-disabled={availability?.kind === "disabled"} className="entity-action-composer__root" key={quick.signature.rootActionId + JSON.stringify(quick.signature.selections)} onClick={() => { if (availability?.kind === "enabled") chooseQuickAction(quick); }} type="button"><span aria-hidden="true" className="entity-action-composer__icon">{action?.definition.iconKey?.slice(0, 1).toUpperCase()}</span><strong>{quick.label}</strong>{availability?.kind === "disabled" && <small id={`${quick.signature.rootActionId}-reason`}>{availability.reason}</small>}</button>;
            })}
          </div>
        ) : (
          <div className="entity-action-composer__composition">
            <p className="entity-action-composer__breadcrumb">{crumb}</p>
            {composition?.status === "readyToConfirm" ? (
              <button
                className="primary-button"
                onClick={confirm}
                type="button"
              >
                CONFIRM
              </button>
            ) : (
              options.map((option) => (
                <button
                  disabled={option.disabledReason !== undefined}
                  key={option.id}
                  onClick={() => selectOption(option.id)}
                  type="button"
                >
                  {option.labelKey
                    .replace(`${entityPrefix}option.`, "")
                    .toUpperCase()}
                </button>
              ))
            )}
            <footer>
              <button
                className="secondary-button"
              disabled={!canBack}
                onClick={back}
                type="button"
              >
                ← BACK
              </button>
              <button className="text-button" onClick={cancel} type="button">
                CANCEL
              </button>
            </footer>
          </div>
        )}
        {state.message !== null && (
          <p className="entity-action-composer__message" role="alert">
            {state.message}
          </p>
        )}
      </section>
    </div>
  );
}
