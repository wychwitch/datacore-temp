import { debounce, ItemView, Menu, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { ScriptLanguage } from "utils/javascript";
import { DatacoreJSRenderer, ReactRenderer } from "./javascript";
import { DatacoreLocalApi } from "api/local-api";
import { DatacoreApi } from "api/api";
import { createContext } from "preact";
import { Group, Stack } from "api/ui/layout";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { Textbox, VanillaSelect } from "api/ui/basics";
import { useIndexUpdates, useStableCallback } from "./hooks";
import DatacorePlugin from "main";
import { DATACORE_CONTEXT } from "./markdown";

export const VIEW_TYPE_DATACORE = "datacore-query-view";

const CUSTOM_VIEW_CONTEXT = createContext<DatacoreQueryView>(undefined!);

const backButton = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="svg-icon lucide-arrow-left"
    >
        <path d="m12 19-7-7 7-7"></path>
        <path d="M19 12H5"></path>
    </svg>
);

function useVaultFiles() {
    const core = useContext(DATACORE_CONTEXT);
    const { vault } = core;
    const [fileList, setFileList] = useState<string[]>([]);
    let revision = useIndexUpdates(core);
    useEffect(() => {
        setFileList(vault.getFiles().map((f) => f.path));
    }, [revision, setFileList]);
    return fileList;
}

function useViewState<T>(): [T, (prop: keyof T, value: any) => void, () => void] {
    const view = useContext(CUSTOM_VIEW_CONTEXT) as ItemView;
    const [state, setter] = useState(view.getEphemeralState() as T);
    const stateSaver = useCallback(() => {
        view.setState(state, { history: false });
    }, [state, setter]);
    const setState = (prop: keyof T, value: any) => {
        setter((v) => ({ ...v, [prop]: value }));
    };
    return [state, setState, stateSaver];
}

function DatacoreViewSettings() {
    const [internalState, setInternalState, saveState] = useViewState<DatacoreViewState>();
    const options = [
        {
            label: "Javascript",
            value: "js",
        },
        {
            label: "Typescript",
            value: "ts",
        },
        {
            label: "Javascript (JSX)",
            value: "jsx",
        },
        {
            label: "Typescript JSX",
            value: "tsx",
        },
    ];
    useEffect(() => {
        debounce(saveState, 250, true)();
    }, [internalState]);
    const view = useContext(CUSTOM_VIEW_CONTEXT);
    const files = useVaultFiles();
    return (
        <Stack align="stretch">
            <button
                className="clickable-icon"
                style="align-self: start"
                onClick={() => {
                    saveState();
                    view.toggleSettings(false);
                }}
            >
                {backButton}
            </button>
            <Group justify="space-between" align="center">
                <h6>View Title</h6>
                <Textbox
                    defaultValue={view.getState().title}
                    onChange={(e) => setInternalState("title", e.currentTarget.value as string)}
                />
            </Group>
            <Group justify="space-between" align="center">
                <h6>View Type</h6>
                <VanillaSelect
                    defaultValue={view.getState().sourceType}
                    options={options}
                    value={internalState.sourceType}
                    onValueChange={(s) => setInternalState("sourceType", s)}
                />
            </Group>
            <Group justify="space-between" align="center">
                <h6>Script/View source</h6>
                <textarea
                    style={{resize: "vertical", minWidth: "75%", fontFamily: "monospace"}}
                    defaultValue={view.getState().script}
                    value={internalState.script}
                    onChange={(e) => setInternalState("script", e.currentTarget.value as string)}
                />
            </Group>
            <Group justify="space-between" align="center">
                <Stack>
                    <h6>Current File</h6>
                    <small>The path returned by functions like `useCurrentPath` in this view</small>
                </Stack>
                <VanillaSelect
                    defaultValue={view.getState().currentFile}
                    options={files?.map((f) => ({ label: f, value: f }))}
                    onValueChange={(s) => setInternalState("currentFile", s)}
                />
            </Group>
        </Stack>
    );
}

export interface DatacoreViewState {
    sourceType: /* "datacore" | */ ScriptLanguage;
    script: string;
    currentFile: string;
    title: string;
}

export class DatacoreQueryView extends ItemView {
    public internalState: DatacoreViewState = {
        title: "",
        currentFile: "",
        script: "",
        sourceType: "js",
    };
    public jsRenderer: DatacoreJSRenderer;
    public settingsRenderer: ReactRenderer;
    public isSettingsShowing: boolean;
    private id: string;
    navigation: boolean = false;
    constructor(leaf: WorkspaceLeaf, public api: DatacoreApi, private plugin: DatacorePlugin) {
        super(leaf);
        this.rerender();
    }
    getViewType(): string {
        return VIEW_TYPE_DATACORE;
    }
    getDisplayText(): string {
        return `${this.internalState.title} (Datacore)`;
    }
    public async onload() {
        this.settingsRenderer = new ReactRenderer(
            this.app,
            this.api.core,
            this.contentEl,
            this.internalState.currentFile || "",
            (
                <CUSTOM_VIEW_CONTEXT.Provider value={this}>
                    <DatacoreViewSettings />
                </CUSTOM_VIEW_CONTEXT.Provider>
            )
        );

        this.id = this.leaf.serialize().id;
				this.contentEl.addClass("markdown-rendered");
        this.rerender();
    }
    public onPaneMenu(menu: Menu, source: "more-options" | "tab-header" | string): void {
        if (source === "more-options") {
            menu.addItem((it) => {
                it.setIcon("settings");
                it.setTitle("View configuration");
                it.onClick((e) => {
                    this.toggleSettings(true);
                });
            });
        }
    }
    private settingsShowing: boolean;
    public toggleSettings(show: boolean): void {
        this.settingsShowing = show;
        if (show) {
            this.settingsRenderer = new ReactRenderer(
                this.app,
                this.api.core,
                this.contentEl,
                this.internalState.currentFile || "",
                (
                    <CUSTOM_VIEW_CONTEXT.Provider value={this}>
                        <DatacoreViewSettings />
                    </CUSTOM_VIEW_CONTEXT.Provider>
                )
            );
            this.removeChild(this.jsRenderer);
            this.addChild(this.settingsRenderer);
        } else {
            this.removeChild(this.settingsRenderer);
            this.rerender();
        }
    }
    public getState() {
        return this.internalState;
        // return this.internalState;
    }
    public async onOpen(): Promise<void> {}
    rerender(): void {
        this.removeChild(this.jsRenderer);
        this.jsRenderer = new DatacoreJSRenderer(
            new DatacoreLocalApi(this.api, this.internalState.currentFile || ""),
            this.contentEl,
            this.internalState.currentFile || "",
            this.internalState.script || "",
            this.internalState.sourceType || "js"
        );
        this.addChild(this.jsRenderer);
    }
    public async setState(state: DatacoreViewState, result: ViewStateResult): Promise<void> {
        Object.assign(this.internalState, state);
        this.leaf.tabHeaderInnerTitleEl.textContent = this.titleEl.textContent = this.getDisplayText();
				if(!this.settingsShowing)
					this.rerender();
    }
		public onunload(): void {
				this.removeChild(this.jsRenderer);
				this.removeChild(this.settingsRenderer);
		}
}
