/** A successful response with a JSON body. */
export function ok(body, status = 200) {
  return { status, body };
}

/** A failed response: { error: { code, message } }, the format every route answers errors in. */
export function fail(status, code, message) {
  return { status, body: { error: { code, message } } };
}
