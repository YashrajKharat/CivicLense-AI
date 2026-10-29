/**
 * The signature element.
 * Resolves a dropped pin into a named accountable party:
 * City → Zone → Ward → Asset → Department → Agency → Contract
 *
 * Rendered identically for residents and administrators, so a resident sees
 * exactly the accountability chain an administrator sees.
 */
export default function ResponsibilitySpine({ chain }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 26px", position: "relative" }}>
      <span style={{ position: "absolute", left: 6, top: 12, bottom: 14, width: 2, background: "var(--line)" }} />

      {chain.map((node, i) => (
        <li
          key={`${node.key}-${i}`}
          className="fade-in"
          style={{ position: "relative", padding: "10px 0", animationDelay: `${i * 45}ms` }}
        >
          <span
            style={{
              position: "absolute", left: -26, top: 16, width: 14, height: 14, borderRadius: "50%",
              background: node.emphasis ? "var(--accent)" : "var(--surface)",
              border: `2px solid ${node.emphasis ? "var(--accent)" : "var(--line-firm)"}`,
              boxShadow: node.emphasis ? "0 0 0 4px var(--accent-100)" : "none",
            }}
          />
          <div className="label">{node.key}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: node.emphasis ? "var(--accent)" : "var(--text)" }}>
            {node.value}
          </div>
          {node.note && <div className="label" style={{ marginTop: 3 }}>{node.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Builds the display chain from /geo/responsibility.
 *
 * "Responsible" is not one thing. A pothole belongs to the agency paid to keep
 * that road intact. A dirty kitchen belongs to the premises and to the person
 * whose licence is on the wall. Showing a contract number for a food complaint
 * would be worse than showing nothing, so the category decides which tail the
 * chain gets.
 */
export function buildChain(r) {
  const chain = [
    { key: "City", value: r.city || "Mumbai", note: r.authority },
    { key: "Zone", value: r.zone_name || "—" },
    { key: "Ward", value: r.ward_code, note: r.coordinates },
    ...(r.asset_name ? [{ key: "Asset", value: r.asset_name, note: r.asset_code }] : []),
    { key: "Department", value: r.department_name, emphasis: true },
  ];

  if (r.responsible_party === "establishment") {
    if (r.establishment_name) {
      chain.push({
        key: "Premises",
        value: r.establishment_name,
        note: (r.establishment_kind || "").replace(/_/g, " "),
      });
      chain.push({
        key: "Licence holder",
        value: r.owner_name || "Not on record",
        emphasis: true,
        note: r.licence_no ? `${r.licence_authority || "Licence"} ${r.licence_no}` : "No licence recorded",
      });
    } else {
      chain.push({
        key: "Premises",
        value: "Not identified",
        note: "No licensed premises within 80 m — an inspector will confirm on site",
      });
    }
    return chain;
  }

  if (r.responsible_party === "department") {
    chain.push({
      key: "Handled by",
      value: "Departmental crew",
      note: "No external contractor covers this category",
    });
    return chain;
  }

  if (r.contract_no) {
    chain.push({ key: "Maintenance agency", value: r.agency });
    chain.push({
      key: "Contract",
      value: r.contract_no,
      emphasis: true,
      note: `Active · expires ${r.contract_ends}`,
    });
  } else {
    chain.push({
      key: "Contract",
      value: "None on record",
      note: "Departmental crew will be assigned",
    });
  }

  return chain;
}
