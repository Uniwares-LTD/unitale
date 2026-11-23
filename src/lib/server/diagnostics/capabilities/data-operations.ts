import "server-only";
import { define } from "../context";
import {
  dataOperationScope,
  operationStatusInput,
  readDataOperations,
} from "../../data-operations";
export const dataOperationsStatus = define({
  description:
    "Last recorded data-operation outcomes and current ledger summary; authoritative liveness/recovery remains on the host.",
  inputs: {
    planId: "optional exact plan ID",
    offset: "optional detail offset; 100 entries per page",
  },
  input: operationStatusInput,
  async run(context, input) {
    return readDataOperations(context.db, dataOperationScope(), input, {
      timeoutMS: context.timeoutMS(),
    });
  },
});
