import { Checkbox, Slider, Switch } from "api/ui/basics";
import { Field } from "expression/field";
import { Dispatch, useCallback, useMemo, useState } from "preact/hooks";
import { useFinalizer, useSetField } from "utils/fields";
import { EditableAction, UncontrolledTextEditable } from "./editable";
import Select from "react-select";
export function FieldCheckbox(
    props: {
        className?: string;
        field: Field;
        defaultChecked?: boolean;
    	dispatch: Dispatch<EditableAction<Field>>;
    } & React.HTMLProps<HTMLInputElement>
) {
    const { field, defaultChecked, dispatch, ...rest } = props;
    return (
        <Checkbox
            {...rest}
            disabled={undefined}
            defaultChecked={defaultChecked}
            onCheckChange={useSetField(field, (b) => dispatch({type: "content-changed", newValue: {...field, value: b}}))}
            checked={undefined}
        />
    );
}

export function EditableTextField(props: {
    field: Field;
    inline: boolean;
    dispatch: Dispatch<EditableAction<string>>;
}) {
    const { field, inline, dispatch } = props;

    return <ControlledEditableTextField text={field.value as string} inline={inline} dispatch={dispatch} />;
}

export function ControlledEditableTextField(props: {
    text: string;
    inline: boolean;
    dispatch: Dispatch<EditableAction<string>>;
}) {
    const { text, inline, dispatch } = props;
    const [textState, setText] = useState(text);
    const onInput = async (e: KeyboardEvent) => {
        setText((e.currentTarget as HTMLInputElement).value);

        if (props.inline) {
            if (e.key === "Enter") {
                e.preventDefault();
                await useFinalizer(textState, dispatch)();
            }
        } else {
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                await useFinalizer(textState, dispatch)();
            }
        }
    };
    return <UncontrolledTextEditable text={text} inline={inline} dispatch={dispatch} onInput={onInput} />;
}

export function FieldSlider(
    props: {
        className: string;
        min: number;
        max: number;
        step: number;
        field: Field;
    	dispatch: Dispatch<EditableAction<Field>>;
    } & React.HTMLProps<HTMLInputElement>
) {
    const { field, dispatch, min, max, step, ...rest } = props;
    const defaultValue = field.value as number;
    return (
        <Slider
            {...rest}
            disabled={false}
            defaultValue={defaultValue}
            min={min}
            max={max}
            step={step}
						value={undefined}
            onValueChange={useSetField(field, (b) => dispatch({type: "content-changed", newValue: {...field, value: b}}))}
        />
    );
}

export function FieldSwitch(
    props: {
        className?: string;
        disabled?: boolean;
        field: Field;
    	dispatch: Dispatch<EditableAction<Field>>;
    } & React.HTMLProps<HTMLInputElement>
) {
    const { field, dispatch, ...rest } = props;
    return (
        <Switch
            {...rest}
            onToggleChange={useSetField(field, (b) => dispatch({type: "content-changed", newValue: {...field, value: b}}))}
            defaultChecked={field.value as boolean}
            checked={undefined}
        />
    );
}

export function FieldSelect({
    field,
    multi = false,
    options,
		dispatch
}: {
    field: Field;
    multi?: boolean;
    options: { value: string; label: string }[];
    dispatch: Dispatch<EditableAction<Field>>;
}) {
    const onChange = useCallback((newValue: any) => {
			let normalized;
        if (Array.isArray(newValue)) {
					normalized = newValue.map(x => x.value)
        } else {
					normalized = newValue.value;
        }
        useSetField(field, (b) => dispatch({type: "content-changed", newValue: {...field, value: b}}))(normalized)
    }, []);
		const arrayVal = useMemo(() => Array.isArray(field.value) ? field.value : [field.value], [field])
    const defVal = useMemo(
        () =>
            multi
                ? options.filter((a) => (arrayVal).findIndex((b) => b == a.value) != -1)
                : options.find((a) => a.value == field.value),
        [options, multi]
    );
    return (
        <Select
            classNamePrefix="datacore-selectable"
            onChange={onChange}
            unstyled
            isMulti={multi ?? false}
            options={options}
            menuPortalTarget={document.body}
            defaultValue={defVal}
            classNames={{
                input: () => "prompt-input",
                valueContainer: () => "suggestion-item value-container",
                container: () => "suggestion-container",
                menu: () => "suggestion-content suggestion-container",
                option: (props: any) => `suggestion-item${props.isSelected ? " is-selected" : ""}`,
            }}
        />
    );
}
