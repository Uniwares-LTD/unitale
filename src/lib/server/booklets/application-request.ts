import "server-only";
import { database } from "../mongo";
import { extensionProductTypes } from "../extensions";
import { moduleEnabled } from "../../project";
import { serverExtensions } from "../../../project/server";
import { bookletApplication } from "./application";

/** The facade for a verified request session; the actor never comes from input. */
export function requestBookletApplication(session: {
  uid: string;
  auth_time: number;
}) {
  return bookletApplication(
    database(),
    { uid: session.uid, authTime: session.auth_time },
    { types: extensionProductTypes(serverExtensions, moduleEnabled) },
  );
}
