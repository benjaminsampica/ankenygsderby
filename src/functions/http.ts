import azureFunctions from "@azure/functions";
import { handler } from "./handler.js";
azureFunctions.app.http("derby", { methods: ["GET", "POST"], authLevel: "anonymous", route: "{*path}", handler });
