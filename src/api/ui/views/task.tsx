import { MarkdownListItem, MarkdownTaskItem } from "index/types/markdown";
import { DefaultListElement, ListState } from "api/ui/views/list";
import { useIndexUpdates, useStableCallback } from "ui/hooks";
import { Fragment } from "preact";
import { APP_CONTEXT, DATACORE_CONTEXT } from "ui/markdown";
import { JSXInternal } from "preact/src/jsx";
import { Dispatch, useContext, useMemo, useRef, useState } from "preact/hooks";
import { rewriteTask, setTaskCompletion } from "ui/utils";
import { Literal, Literals } from "expression/literal";
import {
    EditableAction,
    EditableListField,
    EditableState,
    TextEditable,
    useEditableDispatch,
} from "ui/fields/editable";
import { setInlineField } from "index/import/inline-field";
import { BaseFieldProps } from "ui/fields/common-props";
import { Field } from "expression/field";
import { DateTime } from "luxon";
import "styles/lists.css";

export interface TaskProps extends ListState<MarkdownTaskItem | MarkdownListItem> {
    /** task states to cycle through, if specified */
    additionalStates?: string[];
    /** fields to display under each item in this task list */
    displayedFields?: (BaseFieldProps<Literal> & { key: string })[];
}

export function TaskList({
    rows: items,
    additionalStates: states,
    renderer: listRenderer = (item, index) => <DefaultListElement element={item} />,
    ...rest
}: TaskProps) {
    const content = useMemo(() => {
        return (
            <ul className="datacore contains-task-list">
                {items?.map((item, ind) =>
                    item instanceof MarkdownTaskItem ? (
                        <Task state={{ ...rest, additionalStates: states }} item={item} />
                    ) : (
                        listRenderer(item, ind)
                    )
                )}
            </ul>
        );
    }, [items, states]);
    return <Fragment>{!!items && content}</Fragment>;
}

export function Task({ item, state: props }: { item: MarkdownTaskItem; state: TaskProps }) {
    const app = useContext(APP_CONTEXT);
    const core = useContext(DATACORE_CONTEXT);
    const [iu] = useState(useIndexUpdates(core));
    const { settings } = core;
    const states = [" ", ...(props.additionalStates || []), "x"];
    const nextState = useMemo(() => {
        if (props.additionalStates && props.additionalStates?.length > 0) {
            let curIndex = states.findIndex((a) => a === item.$status);
            curIndex++;
            if (curIndex >= states.length) {
                curIndex = 0;
            }
            return states[curIndex];
        } else {
            return item.$completed ? " " : "x";
        }
    }, [props.additionalStates, item, item.$status, item.$completed]);

    const completedRef = useRef<Dispatch<EditableAction<Literal>>>(null);
    const onChecked = useStableCallback(
        async (evt: JSXInternal.TargetedMouseEvent<HTMLInputElement>) => {
            // evt.stopPropagation();
            const completed = evt.currentTarget.checked;

            let newStatus: string;
            if (evt.shiftKey) {
                newStatus = nextState!;
            } else {
                newStatus = completed ? "x" : " ";
            }
            const parent = evt.currentTarget.parentElement;
            parent?.setAttribute("data-task", newStatus);
            async function rewr(task: MarkdownTaskItem) {
                let newText = setTaskCompletion(
                    task,
                    task.$text,
                    // TODO: replace these next three arguments with proper settings
                    false,
                    settings.taskCompletionTextField,
                    settings.defaultDateFormat,
                    newStatus?.toLowerCase() === "x"
                );
                await rewriteTask(app.vault, task, newStatus, newText);
                task.$status = newStatus;
            }
            if (settings.recursiveTaskCompletion) {
                let flatted: MarkdownTaskItem[] = [];
                function flatter(iitem: MarkdownTaskItem | MarkdownListItem) {
                    if (iitem instanceof MarkdownTaskItem) {
                        flatted.push(iitem);
                        iitem.$elements.forEach(flatter);
                    }
                }
                item.$elements.forEach(flatter);
                flatted = flatted.flat(Infinity);
                for (let iitem of flatted) {
                    await rewr(iitem);
                }
            }
            await rewr(item);
            const nv = completed ? DateTime.now().toFormat(settings.defaultDateFormat) : null;
            completedRef.current && completedRef.current({ type: "commit", newValue: nv });
        },
        [item, iu]
    );
    const onChanger = useStableCallback(
        async (val: Literal) => {
            if (typeof val === "string") {
                let withFields = `${val}${Object.keys(item.$infields).length ? " " : ""}`;
                for (let field in item.$infields) {
                    withFields = setInlineField(withFields, field, item.$infields[field].raw);
                }
                await rewriteTask(app.vault, item, item.$status, withFields);
            }
        },
        [item, iu]
    );
    const checked = useMemo(() => item.$status !== " ", [item.$status]);
    const eState: EditableState<string> = useMemo(() => {
        return {
            updater: onChanger,
            content: item.$strippedText,
            inline: false,
            isEditing: false,
        } as EditableState<string>;
    }, [item, iu]);
    const theElement = useMemo(() => <TextEditable sourcePath={item.$file} {...eState} />, [eState, item, props.rows]);

    const editableFields = (props.displayedFields || []).map((ifield) => {
        let defVal = typeof ifield.defaultValue == "function" ? ifield.defaultValue() : ifield.defaultValue;
        let defField: Field = {
            key: ifield.key,
            value: defVal,
            raw: Literals.toString(defVal),
        };
        const [fieldValue] = useState<Literal>(item.$infields[ifield?.key]?.value || defField.value!);
        const [state2, dispatch] = useEditableDispatch<Literal>({
            content: fieldValue,
            isEditing: false,
            updater: useStableCallback(
                (val: Literal) => {
                    const dateString = (v: Literal) =>
                        v instanceof DateTime
                            ? v.toFormat(settings.defaultDateFormat)
                            : v != null
                            ? Literals.toString(v)
                            : undefined;

                    let withFields = setInlineField(item.$text, ifield.key, dateString(val));
                    if (item.$infields[ifield.key]) item.$infields[ifield.key].value = dateString(val)!;
                    for (let field in item.$infields) {
                        withFields = setInlineField(withFields, field, dateString(item.$infields[field]?.value));
                    }
                    rewriteTask(app.vault, item, item.$status, withFields);
                },
                [item.$infields, iu]
            ),
        });
        if (ifield.key == settings.taskCompletionTextField) {
            //@ts-ignore huh?
            completedRef.current = dispatch;
        }
        return (
            <EditableListField
                props={state2}
                dispatch={dispatch}
                type={ifield.type || Literals.wrapValue(fieldValue)!.type}
                file={item.$file}
                field={item.$infields[ifield.key] || defField}
                config={ifield.config}
                parent={item}
                updater={state2.updater}
                value={fieldValue}
                renderAs={ifield.renderAs}
            />
        );
    });
    const [collapsed, setCollapsed] = useState<boolean>(true);
    const hasChildren = item.$elements.length > 0;
    const toggleCnames = ["datacore-collapser"];
    if (collapsed) toggleCnames.push("is-collapsed");
    if (!hasChildren) toggleCnames.push("no-children");
    const collapseIndicator = (
        <div onClick={() => setCollapsed(!collapsed)} className={toggleCnames.join(" ")} dir="auto">
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
                className="svg-icon right-triangle"
            >
                <path d="M3 8L12 17L21 8"></path>
            </svg>
        </div>
    );

    return (
        <li className={"datacore task-list-item" + (checked ? " is-checked" : "")} data-task={item.$status}>
            {collapseIndicator}
            <input className="datacore task-list-item-checkbox" type="checkbox" checked={checked} onClick={onChecked} />
            <div>
                <div className="datacore-list-item-content">
                    {theElement}
                    <div className="datacore-list-item-fields">{editableFields}</div>
                </div>
            </div>
            {hasChildren && !collapsed && <TaskList {...props} rows={item.$elements} />}
        </li>
    );
}
