import React, { useEffect, useMemo, useState } from "react";
import { Smartphone as SmartphoneIcon } from "lucide-react";
import Smartphone from "./smartphone/Smartphone";
import {
  buildContacts,
  buildNewsItems,
  buildSocialFeed,
  buildProspects,
  buildScandals,
} from "./smartphone/data";

export default function SmartphoneOverlay({
  teamId,
  teamName,
  news = [],
  rumors = [],
  morale = 50,
  fatigue = 50,
  injuries = 0,
  players = [],
  staff = [],
  board = [],
  agents = [],
  smartphoneData = null,
  onSmartphoneEvent,
}) {
  const key = `pcbasket.smartphone.v2.${teamId || "default"}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved?.open === "boolean") setOpen(saved.open);
    } catch {
      // ignore
    }
  }, [key, teamId]);

  useEffect(() => {
    if (!teamId) return;
    try {
      window.localStorage?.setItem(key, JSON.stringify({ open }));
    } catch {
      // ignore
    }
  }, [key, teamId, open]);

  const snapshot = smartphoneData?.snapshot || smartphoneData || {};
  const seedOnly = true;
  const effectiveNews = snapshot.news || news;
  const effectiveRumors = snapshot.rumors || rumors;
  const effectiveScandals = snapshot.scandals || [];
  const effectiveCalls = snapshot.calls || [];
  const effectiveMeetings = snapshot.meetings || {};
  const effectiveVoicemails = snapshot.voicemails || [];
  const fanPulse = snapshot.fanPulse || snapshot.fan_pulse || {};
  const gmState = snapshot.gm?.state || {};
  const badgeCount = useMemo(() => {
    const newsCount = (effectiveNews || []).length + (effectiveRumors || []).length;
    const callsCount = (effectiveCalls || []).length + (effectiveVoicemails || []).length;
    const scandalsCount = (effectiveScandals || []).length;
    const meetingsCount =
      (effectiveMeetings?.requests || []).length + (effectiveMeetings?.scheduled || []).length;
    return newsCount + callsCount + scandalsCount + meetingsCount;
  }, [effectiveNews, effectiveRumors, effectiveCalls, effectiveVoicemails, effectiveScandals, effectiveMeetings]);

  const contacts = useMemo(
    () => buildContacts({ players, staff, board, agents }),
    [players, staff, board, agents],
  );
  const allNewsItems = useMemo(
    () => buildNewsItems({ news: effectiveNews, rumors: effectiveRumors, teamName }),
    [effectiveNews, effectiveRumors, teamName],
  );
  const newsItems = useMemo(
    () => allNewsItems.filter((item) => item.type !== "rumor"),
    [allNewsItems],
  );
  const rumorItems = useMemo(
    () => allNewsItems.filter((item) => item.type === "rumor"),
    [allNewsItems],
  );
  const socialFeed = useMemo(
    () => buildSocialFeed({ news: effectiveNews, rumors: effectiveRumors, teamName }),
    [effectiveNews, effectiveRumors, teamName],
  );
  const prospects = useMemo(() => buildProspects({ players, teamId }), [players, teamId]);
  const scandals = useMemo(() => {
    if (seedOnly) return effectiveScandals;
    return effectiveScandals.length ? effectiveScandals : buildScandals({ players });
  }, [effectiveScandals, players, seedOnly]);
  const initialStress = gmState.stress ?? gmState.gm_stress ?? null;
  const sentimentChange = Number.isFinite(Number(fanPulse?.sentiment?.change))
    ? Number(fanPulse.sentiment.change)
    : null;
  const hotSeatRank = gmState.hot_seat_rank
    ?? gmState.hotSeatRank
    ?? fanPulse.hotSeatRank
    ?? fanPulse.hot_seat_rank
    ?? null;

  if (!open) {
    return (
      <div className="fixed right-6 bottom-6 z-[40000]">
        <button
          type="button"
          className="w-14 h-14 rounded-2xl bg-white/90 shadow-lg flex items-center justify-center border border-white/40"
          onClick={() => setOpen(true)}
        >
          <SmartphoneIcon size={18} />
          {badgeCount > 0 && <span className="smartphone-badge">{badgeCount}</span>}
        </button>
      </div>
    );
  }

  return (
    <Smartphone
      isOpen={open}
      onClose={() => setOpen(false)}
      teamName={teamName}
      contacts={contacts}
      newsItems={newsItems}
      rumorItems={rumorItems}
      socialFeed={socialFeed}
      prospects={prospects}
      scandals={scandals}
      calls={effectiveCalls}
      voicemails={effectiveVoicemails}
      meetingsRequests={effectiveMeetings.requests || []}
      meetingsScheduled={effectiveMeetings.scheduled || []}
      sentimentChange={sentimentChange}
      fanPulse={fanPulse}
      hotSeatRank={hotSeatRank}
      initialStress={initialStress}
      seedOnly={seedOnly}
      onEvent={onSmartphoneEvent}
    />
  );
}
