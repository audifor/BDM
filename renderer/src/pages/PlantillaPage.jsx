import React from "react";

export default function PlantillaPage({ myTeam, renderStart, renderEquipo }) {
  if (!myTeam) return renderStart();
  return renderEquipo();
}

