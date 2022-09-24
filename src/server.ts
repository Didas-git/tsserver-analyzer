// Majority of the code was taken from https://github.com/mhartington/nvim-typescript

import { ChildProcess, SpawnOptions, spawn } from "node:child_process";
import { EOL, platform } from "node:os";
import { createInterface, Interface } from "node:readline"
import EventEmitter from "node:events";
import protocol from "typescript/lib/protocol";


export class Client extends EventEmitter {

    public serverPath: string = "tsserver";
    public server!: ChildProcess;
    public serverOptions: string[] = [];
    public seq: number = 0;
    public rl!: Interface;
    public seqToPromises: Record<string, any> = {};

    private getErrRes = [];

    start(): Promise<void> {
        return new Promise((res) => {
            let path = this.serverPath;
            let args = this.serverOptions;
            let options: SpawnOptions = {
                stdio: "pipe",
                cwd: process.cwd(),
                env: process.env,
                detached: true,
                shell: false
            };

            if (platform() === "win32") {
                path = "cmd";
                args = ["/c", this.serverPath, ...args];
                options.detached = false;
            }

            this.server = spawn(path, args, options)

            this.rl = createInterface({
                //@ts-expect-error
                input: this.server.stdout,
                output: this.server.stdin,
                terminal: false
            })

            this.rl.on("line", (msg) => {
                if (msg.indexOf("{") === 0)
                    this.parseResponse(msg);
            })

            return res();
        })
    }

    stop() {
        this.server.kill("SIGINT");
    }

    createRequest<T>(commandName: protocol.CommandTypes[number], args: any): Promise<T> {
        const seq = this.seq++;
        const payload = {
            seq,
            type: 'request',
            arguments: args,
            command: commandName
        };
        const ret = this.createDeferredPromise();
        this.seqToPromises[seq] = ret;
        this.server.stdin?.write(JSON.stringify(payload) + EOL);
        return ret.promise;
    }

    createNoReturnRequest(commandName?: string, args?: any) {
        const seq = this.seq++;
        const payload = {
            seq,
            type: 'request',
            arguments: args,
            command: commandName
        };
        this.server.stdin?.write(JSON.stringify(payload) + EOL);
    }

    createDeferredPromise(): any {
        let resolve: Function = Function;
        let reject: Function = Function;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return {
            resolve,
            reject,
            promise
        };
    }

    parseResponse(data: string) {
        const response = JSON.parse(data);

        const seq = response.request_seq;
        const success = response.success;
        if (typeof seq === "number") {
            if (success) {
                this.seqToPromises[seq].resolve(response.body);
            } else {
                this.seqToPromises[seq].reject(response.message);
            }
        } else {
            if (response.type && response.type === "event") {
                if (response.event && response.event === "telemetry") { }
                if (response.event && response.event === "projectsUpdatedInBackground") { }
                if (response.event && response.event === "projectLoadingFinish")
                    this.emit("projectLoadingFinish")

                if (response.event && (response.event === "semanticDiag" || response.event === "syntaxDiag" || response.event === "suggestionDiag"))
                    //@ts-expect-error
                    this.getErrRes.push(response.body);

                if (response.event && response.event === "requestCompleted")
                    this.getErrCompleted()

            }
        }
    }

    getErrCompleted() {
        this.emit("getErrCompleted", this.getErrRes)
        this.getErrRes = [];
    }

    //#region Commands
    openFile(args: protocol.OpenRequestArgs) {
        this.createNoReturnRequest("open", args);
    }

    closeFile(args: protocol.FileRequestArgs) {
        this.createNoReturnRequest("close", args);
    }

    reloadProject() {
        this.createNoReturnRequest("reloadProjects", null);
    }

    updateFile(args: protocol.ReloadRequestArgs): Promise<protocol.ReloadResponse> {
        return this.createRequest("reload", args);
    }

    quickInfo(args: protocol.FileLocationRequestArgs): Promise<protocol.QuickInfoResponseBody> {
        return this.createRequest("quickinfo", args);
    }

    getDef(args: protocol.FileLocationRequestArgs): Promise<protocol.DefinitionResponse["body"]> {
        return this.createRequest("definition", args);
    }

    getCompletions(args: protocol.CompletionsRequestArgs): Promise<protocol.CompletionInfoResponse["body"]> {
        return this.createRequest("completionInfo", args);
    }

    getCompletionDetails(args: protocol.CompletionDetailsRequestArgs): Promise<protocol.CompletionDetailsResponse["body"]> {
        return this.createRequest("completionEntryDetails", args);
    }

    getProjectInfo(args: protocol.ProjectInfoRequestArgs): Promise<protocol.ProjectInfo> {
        return this.createRequest("projectInfo", args);
    }

    getSymbolRefs(args: protocol.FileLocationRequestArgs): Promise<protocol.ReferencesResponse["body"]> {
        return this.createRequest("references", args);
    }

    getSignature(args: protocol.FileLocationRequestArgs): Promise<protocol.SignatureHelpResponse["body"]> {
        return this.createRequest("signatureHelp", args);
    }

    renameSymbol(args: protocol.RenameRequestArgs): Promise<protocol.RenameResponseBody> {
        return this.createRequest("rename", args);
    }

    getTypeDef(args: protocol.FileLocationRequestArgs): Promise<protocol.TypeDefinitionResponse["body"]> {
        return this.createRequest("typeDefinition", args);
    }

    getDocumentSymbols(args: protocol.FileRequestArgs): Promise<protocol.NavTreeResponse["body"]> {
        return this.createRequest("navtree", args);
    }

    getWorkspaceSymbols(args: protocol.NavtoRequestArgs): Promise<protocol.NavtoResponse["body"]> {
        return this.createRequest("navto", args);
    }

    getSemanticDiagnosticsSync(args: protocol.SemanticDiagnosticsSyncRequestArgs): Promise<protocol.Diagnostic[]> {
        return this.createRequest("semanticDiagnosticsSync", args);
    }

    getSyntacticDiagnosticsSync(args: protocol.SyntacticDiagnosticsSyncRequestArgs): Promise<protocol.Diagnostic[]> {
        return this.createRequest("syntacticDiagnosticsSync", args);
    }

    getSuggestionDiagnosticsSync(args: protocol.SuggestionDiagnosticsSyncRequestArgs): Promise<protocol.Diagnostic[]> {
        return this.createRequest("suggestionDiagnosticsSync", args);
    }

    getCodeFixes(args: protocol.CodeFixRequestArgs): Promise<protocol.GetCodeFixesResponse["body"]> {
        return this.createRequest("getCodeFixes", args);
    }

    getApplicableRefactors(args: protocol.GetApplicableRefactorsRequestArgs): Promise<protocol.GetApplicableRefactorsResponse["body"]> {
        return this.createRequest("getApplicableRefactors", args);
    }

    getSupportedCodeFixes(): Promise<protocol.GetSupportedCodeFixesResponse["body"]> {
        return this.createRequest("getSupportedCodeFixes", null);
    }

    getCombinedCodeFix(args: protocol.GetCombinedCodeFixRequestArgs): Promise<protocol.GetCombinedCodeFixResponse["body"]> {
        return this.createRequest("getCombinedCodeFix", args);
    }

    getOrganizedImports(args: protocol.OrganizeImportsRequestArgs): Promise<protocol.OrganizeImportsResponse["body"]> {
        return this.createRequest("organizeImports", args);
    }

    getProjectError(args: protocol.GeterrForProjectRequestArgs): void {
        this.createRequest("geterrForProject", args)
    }

    getEditsForFileRename(args: protocol.GetEditsForFileRenameRequestArgs): Promise<protocol.GetEditsForFileRenameResponse["body"]> {
        return this.createRequest("getEditsForFileRename", args)
    }
    //#endregion Commands
}