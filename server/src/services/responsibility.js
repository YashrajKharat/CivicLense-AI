import { query } from "../db/pool.js";
import { notFound } from "../middleware/errors.js";

/**
 * Resolves a coordinate into the accountability chain behind the
 * Responsibility Spine.
 *
 * "Responsible" is not one thing. A pothole belongs to whichever agency is paid
 * to keep that road intact; a dirty kitchen belongs to the premises and the
 * person whose licence is on the wall. The category decides which, and the
 * spine renders whichever applies rather than pretending every problem has a
 * contractor.
 *
 * categoryId is coerced explicitly: it arrives from a query string, and passing
 * "10" where Postgres expects an int made the join miss silently and return no
 * rows, which surfaced as a 404 on a perfectly valid location.
 */
export async function resolveResponsibility({ lat, lng, categoryId }) {
  const category = Number.isFinite(Number(categoryId)) ? Number(categoryId) : null;

  const { rows } = await query(
    `select * from resolve_responsibility(
       st_setsrid(st_makepoint($1, $2), 4326)::geography, $3::int
     )`,
    [Number(lng), Number(lat), category]
  );

  const r = rows[0];
  if (!r) {
    throw notFound(
      "This location is outside every serviced ward. Move the pin to somewhere inside the city"
    );
  }

  return {
    city: "Mumbai",
    authority: r.authority || "MCGM",
    zone_name: r.zone_name,
    ward_code: r.ward_code,
    coordinates: `${Number(lat).toFixed(4)}° N, ${Number(lng).toFixed(4)}° E`,
    asset_name: r.asset_name,
    asset_code: r.asset_code,
    department_id: r.department_id,
    department_name: r.department_name || "Unassigned",

    responsible_party: r.responsible_party || "contractor",

    contract_id: r.contract_id,
    contract_no: r.contract_no,
    agency: r.agency,
    contract_ends: r.contract_ends,

    establishment_id: r.establishment_id,
    establishment_name: r.establishment_name,
    establishment_kind: r.establishment_kind,
    owner_name: r.owner_name,
    licence_no: r.licence_no,
    licence_authority: r.licence_authority,
    licence_expires: r.licence_expires,
  };
}
