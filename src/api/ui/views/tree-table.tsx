import { GroupElement, Grouping, Groupings, Literal, Literals } from "expression/literal";
import { GroupingConfig, useAsElement, VanillaColumn, VanillaTableProps } from "./vanilla-table";
import { useInterning } from "ui/hooks";
import { useContext, useMemo } from "preact/hooks";
import { useDatacorePaging } from "./paging";
import { DEFAULT_TABLE_COMPARATOR, SortDirection, SortOn } from "./table";
import { Fragment, VNode } from "preact";
import { CURRENT_FILE_CONTEXT, Lit } from "ui/markdown";
import { Editable, useEditableDispatch } from "ui/fields/editable";

export interface TreeTableRowData<T> {
    value: T;
    children: TreeTableRowData<T>[];
}

export namespace TreeUtils {
	export function isTreeTableRowData<T>(data: any): data is TreeTableRowData<T> {
		return "children" in data && "value" in data && !Array.isArray(data) && Object.keys(data).length == 2 && Array.isArray(data.children)
	}
    export function countInTreeRow<T>(node: TreeTableRowData<T>, top: boolean = true): number {
        let result = 0;
        if (!top) result++;
        for (let n of node.children) result += countInTreeRow(n, false);
        return result;
    }
    export function ofArray<T>(source: T[], childFn: (el: T) => T[]): TreeTableRowData<T>[] {
        const mapper = (el: T): TreeTableRowData<T> => {
            return {
                value: el,
                children: childFn(el).map(mapper),
            } as TreeTableRowData<T>;
        };
        return source.map(mapper);
    }
		export function ofNode<T>(source: T, childFn: (el: T) => T[]): TreeTableRowData<T> {
			return {
				value: source,
				children: ofArray(childFn(source), childFn)
			}
		}

		export function ofGrouping<T>(elements: Grouping<T>, childFn: (el: T) => T[]): Grouping<TreeTableRowData<T>> {
			const mapper = (l: T | GroupElement<T>): GroupElement<TreeTableRowData<T>> | TreeTableRowData<T> => {
				if(Groupings.isElementGroup(l)) return {key: l.key, rows: l.rows.map(mapper)} as GroupElement<TreeTableRowData<T>>;
				return {
					value: l,
					children: childFn(l).map(mapper)
				} as TreeTableRowData<T>
			}
			return elements.map(mapper) as Grouping<TreeTableRowData<T>>;
		} 

    export function count<T>(elements: Grouping<TreeTableRowData<T>> | GroupElement<TreeTableRowData<T>>): number {
        if (Groupings.isElementGroup(elements)) {
            return count(elements.rows);
        } else if (Groupings.isGrouping(elements)) {
            let result = 0;
            for (let group of elements) result += count(group.rows);
            return result;
        } else {
            return elements.reduce((pv, cv) => pv + countInTreeRow(cv), 0);
        }
    }

    function sliceInTreeRow<T>(elements: TreeTableRowData<T>[], start: number, end: number): TreeTableRowData<T>[] {
        if (end <= start) return [];

        let index = 0,
            seen = 0;
        while (index < elements.length && seen + countInTreeRow(elements[index]) <= start) {
            seen += countInTreeRow(elements[index]);
            index++;
        }

        if (index >= elements.length) return [];

        const result: TreeTableRowData<T>[] = [];
        while (index < elements.length && seen < end) {
            const group = elements[index];
            const groupSize = countInTreeRow(group);
            const groupStart = Math.max(seen, start);
            const groupEnd = Math.min(groupSize + seen, end);

            result.push({
                value: group.value,
                children: sliceInTreeRow(group.children, groupStart - seen, groupEnd - seen),
            });

            seen += groupSize;
            index++;
        }

        return result;
    }

    export function slice<T>(
        elements: Grouping<TreeTableRowData<T>>,
        start: number,
        end: number
    ): Grouping<TreeTableRowData<T>> {
        let initial = Groupings.slice(elements, start, end);
        let index = 0,
            seen = count(elements);

        for (let element of initial) {
            if (Groupings.isElementGroup(element)) {
                let groupSize = count(element);
                let groupStart = Math.max(seen, start);
                let groupEnd = Math.min(groupSize + seen, end);
                (initial[index] as GroupElement<TreeTableRowData<T>>).rows = slice(element.rows, groupStart, groupEnd);
            } else {
                let rowLength = countInTreeRow(element);
                let rowStart = Math.max(seen, start);
                let rowEnd = Math.min(rowLength + seen, end);

                (initial[index] as TreeTableRowData<T>).children = sliceInTreeRow(
                    (initial[index] as TreeTableRowData<T>).children,
                    rowStart,
                    rowEnd
                );
            }
            index++;
        }
        return initial;
    }
    /** recursively sort a tree */
    export function sort<T>(
        rows: (TreeTableRowData<T> | GroupElement<TreeTableRowData<T>>)[],
        comparators: { fn: (a: T, b: T) => number; direction: SortDirection }[]
    ): (TreeTableRowData<T> | GroupElement<TreeTableRowData<T>>)[] {
        const realComparator = (
            a: TreeTableRowData<T> | GroupElement<TreeTableRowData<T>>,
            b: TreeTableRowData<T> | GroupElement<TreeTableRowData<T>>
        ): number => {
            for (let comp of comparators) {
                const direction = comp.direction.toLocaleLowerCase() === "ascending" ? 1 : -1;
                let result = 0;
                if (Groupings.isElementGroup(a) && Groupings.isElementGroup(b)) {
                    result = direction * comp.fn(a.key as T, b.key as T);
                } else if (!Groupings.isElementGroup(a) && !Groupings.isElementGroup(b)) {
                    result = direction * comp.fn(a.value, b.value);
                }
                if (result != 0) return result;
            }
            return 0;
        };
        const map = (
            t: TreeTableRowData<T> | GroupElement<TreeTableRowData<T>>
        ): TreeTableRowData<T> | GroupElement<TreeTableRowData<T>> => {
            if (Groupings.isElementGroup(t))
                return { ...t, rows: sort(t.rows, comparators).map(map) } as GroupElement<TreeTableRowData<T>>;
            else return { ...t, children: sort(t.children, comparators).map(map) } as TreeTableRowData<T>;
        };
        rows.sort(realComparator);
        return rows.map(map);
    }
}

export interface TreeTableColumn<T, V = Literal> extends VanillaColumn<T, V> {
    sortable?: boolean;

    comparator?: (first: V, second: V, firstObject: T, secondObject: T) => number;
}

export interface TreeTableState {
    sortOn?: SortOn[];
}

export interface TreeTableProps<T> {
    columns: TreeTableColumn<T>[];
    rows: T[] | Grouping<T>;
    paging?: boolean | number;
    scrollOnPaging?: boolean | number;
    groupings?: VanillaTableProps<TreeTableRowData<T>>["groupings"];
    sortOn?: SortOn[];
		childSelector: (raw: T) => T[]
}

export type TreeTableAction = { type: "sort-column"; column: string; direction: SortDirection };

export function TreeTableHeaderCell<T>({ column }: { column: TreeTableColumn<T> }) {
    const header: string | VNode = useMemo(() => {
        if (!column.title) return column.id;
        else if (typeof column.title === "function") return column.title();
        else return column.title;
    }, [column.id, column.title]);
    const realWidth = useMemo(
        () => (column.width === "minimum" ? "1px" : column.width === "maximum" ? "auto" : column.width + "px"),
        [column.width]
    );
    return (
        <th width={realWidth} className="datacore-table-header-cell">
            <div className="datacore-table-header-title">{header}</div>
        </th>
    );
}

export function ControlledTreeTable<T>(props: TreeTableProps<T>) {
    const columns = useInterning(props.columns, (a, b) => {
        if (a.length != b.length) return false;
        return a.every((value, index) => value == b[index]);
    });
    const totalElements = useMemo(() => {
        if (Groupings.isGrouping(props.rows)) return Groupings.count(props.rows);
        else return props.rows.reduce((pv, cv) => pv + TreeUtils.countInTreeRow(TreeUtils.ofNode(cv, props.childSelector)), 0);
    }, [props.rows]);
    const paging = useDatacorePaging({
        initialPage: 0,
        paging: props.paging,
        scrollOnPageChange: props.scrollOnPaging,
        elements: totalElements,
    });
    const rawSorts = useInterning(props.sortOn, (a, b) => Literals.compare(a, b) == 0);
    const sorts = useMemo(() => {
        return rawSorts?.filter((sort) => {
            const column = columns.find((col) => col.id == sort.id);
            return column && (column.sortable ?? true);
        });
    }, [columns, rawSorts]);
		const groupings = useMemo(() => {
        if (!props.groupings) return undefined;
        if (Array.isArray(props.groupings)) return props.groupings;

        if (Literals.isFunction(props.groupings)) return [{ render: props.groupings }];
        else return [props.groupings];
    }, [props.groupings]);
		const rawRows = useMemo(() => {
			if(!Groupings.isGrouping(props.rows))
				return TreeUtils.ofArray(props.rows, props.childSelector)
			return TreeUtils.ofGrouping(props.rows, props.childSelector)
		}, [props.rows])
    const rows = useMemo(() => {
        if (sorts == undefined || sorts.length == 0) return rawRows;
        const comparators = sorts.map((x) => {
            const comp = columns.find((y) => y.id == x.id)?.comparator ?? DEFAULT_TABLE_COMPARATOR;
            return {
                fn: (a: T, b: T) => comp(a as Literal, b as Literal, a, b),
                direction: x.direction,
            };
        });
        return TreeUtils.sort(rawRows, comparators) as Grouping<TreeTableRowData<T>>;
    }, [rawRows, sorts]);

    const pagedRows = useMemo(() => {
        if (paging.enabled)
            return TreeUtils.slice(rows, paging.page * paging.pageSize, (paging.page + 1) * paging.pageSize);
        return rows;
    }, [paging.page, paging.pageSize, paging.enabled, props.rows]);

    return (
        <div>
            <table className="datacore-table">
                <thead>
                    <tr className="datacore-table-header-row">
                        {columns.map((x) => (
                            <TreeTableHeaderCell<T> column={x} />
                        ))}
                    </tr>
                </thead>
								<tbody>
									{pagedRows.map(row => (<TreeTableRowGroup<T> element={row} columns={columns} level={0} groupings={groupings}/>))}
								</tbody>
            </table>
        </div>
    );
}
export function TreeTableGroupHeader<T>({
    level,
    value,
    width,
    config,
}: {
    level: number;
    value: GroupElement<TreeTableRowData<T>>;
    width: number;
    config?: GroupingConfig<TreeTableRowData<T>>;
}) {
    const sourcePath = useContext(CURRENT_FILE_CONTEXT);
    const rawRenderable = useMemo(() => {
        if (config?.render) return config.render(value.key, value.rows);
        else
            return (
                <h2>
                    <Lit sourcePath={sourcePath} inline={true} value={value.key} />
                </h2>
            );
    }, [config?.render, value.key, value.rows]);
    const renderable = useAsElement(rawRenderable);

    return (
        <tr className="datacore-table-group-header">
            <td style={{paddingLeft: `${level * 1.12}em`}} colSpan={width}>{renderable}</td>
        </tr>
    );
}
export function TreeTableRowGroup<T>({
    level,
    columns,
    element,
    groupings,
}: {
    level: number;
    columns: TreeTableColumn<T>[];
    element: GroupElement<TreeTableRowData<T>> | TreeTableRowData<T>;
    groupings?: GroupingConfig<TreeTableRowData<T>>[];
}) {
    if (Groupings.isElementGroup(element)) {
        const groupingConfig = groupings ? groupings[Math.min(groupings.length - 1, level)] : undefined;
        return (
            <Fragment>
                <TreeTableGroupHeader level={level} value={element} width={columns.length} config={groupingConfig} />
                {element.rows.map((row) => (
                    <TreeTableRowGroup<T> level={level + 1} columns={columns} element={row} groupings={groupings} />
                ))}
            </Fragment>
        );
    } else {
        return <TreeTableRow row={element} columns={columns} level={level + 1} />;
    }
}

export function TreeTableRow<T>({
    level,
    row,
    columns,
}: {
    level: number;
    row: TreeTableRowData<T>;
    columns: TreeTableColumn<T>[];
}) {
    return (
        <Fragment>
            <tr className="datacore-table-row">
                {columns.map((col) => (
                    <TreeTableRowCell<T> row={row} column={col} level={level}/>
                ))}
            </tr>
            {row.children.map((child) => (
                <TreeTableRow row={child} columns={columns} level={level + 1} />
            ))}
        </Fragment>
    );
}

export function TreeTableRowCell<T>({ row, column, level }: { row: TreeTableRowData<T>; column: TreeTableColumn<T>; level: number }) {
    const value = useMemo(() => column.value(row.value), [row, column.value]);
    const renderable = useMemo(() => {
        if (column.render) return column.render(value, row.value);
        else return value;
    }, [row, column.render, value]);

    const rendered = useAsElement(renderable);

    const [editableState, dispatch] = useEditableDispatch<typeof value>({
        content: value,
        isEditing: false,
        updater: (v) => column.onUpdate!(v, row.value),
    });
    const editor = useMemo(() => {
        if (column.editable && column.editor) return column.editor(editableState.content, row.value, dispatch);
        else return null;
    }, [row, column.editor, column.editable, value]);
    return (
        <td
						style={{paddingLeft: `${level * 1.2}em`}}
            onDblClick={() => dispatch({ type: "editing-toggled", newValue: !editableState.isEditing })}
            className="datacore-table-cell"
        >
            {column.editable ? (
                <Editable<typeof value>
                    defaultRender={rendered}
                    editor={editor}
                    dispatch={dispatch}
                    state={editableState}
                />
            ) : (
                rendered
            )}
        </td>
    );
}
