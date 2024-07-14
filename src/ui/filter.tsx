import { Dispatch, Reducer, useContext, useMemo, useReducer, useState } from "preact/hooks";
import { useStableCallback } from "ui/hooks";
import { DATACORE_CONTEXT } from "ui/markdown";
import { QUERY } from "expression/parser";
import { Indexable } from "index/types/indexable";
import { Success } from "api/result";
import { SearchResult } from "index/datastore";
import { Datacore } from "index/datacore";
import { GroupElement, Grouping, Groupings } from "expression/literal";

export type UpdateFn<T> = (val: T) => unknown;

export interface FilterState<T> {
	allItems: Grouping<T>; 
	filter: string;
	filteredItems: Grouping<T>;
}

export type FilterAction<T> = {
  type: "filter-update";
	newFilter: string;
	items: Grouping<T>
} | {
	type: "filter-clear";
};

export interface FilterProps<T> {
	filter: string;
	initialItems: Grouping<T>
}

export function filterReducer<T>(state: FilterState<T>, action: FilterAction<T>): FilterState<T> {
	switch(action.type) {
		case "filter-clear": {
			return {
				...state,
				filteredItems: state.allItems
			}
		}
		case "filter-update": {
			return {
				...state,
				filteredItems: action.items
			}
		}
	}
	console.warn(`datacore: Encountered unrecognized table operation: ${action}`);
	return state;
}
type MaybeGroupArray<T> = Array<GroupElement<T> | T>;
export function filterInGroup<T>(group: Grouping<T> | GroupElement<T>, predicate: (b: T) => boolean): Grouping<T> {
	let something: MaybeGroupArray<T> = [];
	if(Groupings.isElementGroup(group)) {
		(something as MaybeGroupArray<T>).push({key: group.key, rows: filterInGroup(group, predicate)} as GroupElement<T>)
	} else if(Groupings.isGrouping(group)) {
		for(const g of group) {
			something.push(...filterInGroup(g.rows, predicate))
		}
	} else {
		something.push(...(group.filter(predicate) as Grouping<T>))
	}
	return something as Grouping<T>;
}

export function useInput({
  init,
  enter
}: {
  init?: string;
  update?: UpdateFn<string>;
  enter?: (arg: string) => unknown;
}) {
  const [value, setValue] = useState(init ?? "");
  const input = (
    <input type="text"
      value={value}
      onChange={(e) => {
        setValue(e.currentTarget.value);
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" && !!enter) {
          enter(value);
        }
      }}
    />
  );
  return [value, input];
}

export function Filter<T>(props: {
		initialFilter?: string;
		dispatch: Dispatch<FilterAction<T>>,
		state: FilterState<T>
	}) {
	const core = useContext(DATACORE_CONTEXT)

	const enter = useStableCallback((e: string) =>  {
		if(!e) return props.dispatch({type: "filter-clear"})
		let loc = core.datastore.search(QUERY.query.tryParse(e))
		let stt: Grouping<T> = []
		if(loc.successful) {
			stt = filterInGroup(props.state.allItems, a => (loc.value.results as Array<T>).contains(a))
		}
		props.dispatch({type: "filter-update", newFilter: e, items: stt})
	}, [])
	

  const [, input] = useInput({
    init: props.initialFilter,
		enter,
  });
  return (<div>
      <div className="search-input-container">{input}</div>
    </div>
  )
}

export function useFilter<T>(props: FilterProps<T> & {core: Datacore}) {
	let loc = props.core.datastore.search(QUERY.query.tryParse(props.filter))
	if(!loc.successful) return []
	return useMemo(() => {
		return filterInGroup(props.initialItems, (b) => ((loc as Success<SearchResult<Indexable>, string>).value.results as T[]).contains(b))	
	}, [loc.value.results])
}
export function useFilterDispatch<T>(
	initial: FilterState<T> | (() => FilterState<T>)
): [FilterState<T>, Dispatch<FilterAction<T>>] {
	const init = useMemo(() => (typeof initial == "function" ? initial() : initial), []);
	return useReducer(filterReducer as Reducer<FilterState<T>, FilterAction<T>>, init);
}
