import { useState } from "react";
import "./TeamWorkspacePage.css";

export function TeamWorkspacePage({
  appName,
  sections,
}: {
  readonly appName: string;
  readonly sections: readonly string[];
}) {
  const [activeSection, setActiveSection] = useState(sections[0]);

  return (
    <section aria-label={appName} className="pcb-team-workspace">
      {sections.length > 0 && (
        <nav aria-label={`Secciones de ${appName}`} className="bdm-tabs bdm-tabs--canonical" role="tablist">
          {sections.map((label) => (
            <button
              aria-selected={activeSection === label}
              className="bdm-tabs__tab"
              key={label}
              onClick={() => setActiveSection(label)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div aria-label={activeSection ?? appName} className="pcb-team-workspace__canvas" />
    </section>
  );
}
