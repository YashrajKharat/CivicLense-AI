export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what) => new HttpError(404, `${what} not found`);
export const badRequest = (msg, details) => new HttpError(400, msg, details);

/** Wraps async route handlers so rejected promises reach the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Postgres schema errors that mean "a migration has not been run".
 *
 * These arrived as an opaque 500 with the reason only in the terminal — a
 * missing column reads as "the server is broken" in the browser when it
 * actually means one SQL file has not been applied. Naming it turns half an
 * hour of confusion into one obvious action.
 */
const SCHEMA_ERRORS = {
  "42703": "column",       // undefined_column
  "42P01": "table",        // undefined_table
  "22P02": "enum value",   // invalid_text_representation, usually a new enum label
};

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  if (SCHEMA_ERRORS[err.code]) {
    const what = SCHEMA_ERRORS[err.code];
    return res.status(500).json({
      error:
        `The database is missing a ${what} this feature needs — a migration has not been run. ` +
        `Check the [schema] line the server printed at startup, which names the file.`,
      detail: err.message,
      hint: "Run the outstanding migrations in supabase/migrations, in order.",
    });
  }

  // 500 stays opaque — it can carry stack traces and internals.
  //
  // 502 is different: it means a service *we* depend on failed, and the reason
  // is about them, not us. Hiding it meant every upstream failure looked
  // identical in the browser and could only be diagnosed from the terminal,
  // which cost far more time than the detail was ever worth protecting.
  const upstream = status === 502 || status === 503;

  res.status(status).json({
    error: status === 500 ? "Something went wrong on our side." : err.message,
    details: status < 500 || upstream ? err.details : undefined,
  });
}
