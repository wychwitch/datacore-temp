import { Checkbox, Omittable, Slider, Switch } from "api/ui/basics";
import { Field, Fieldbearing } from "expression/field";
import { Dispatch, useCallback, useMemo, useState } from "preact/hooks";
import { useFinalizer, useSetField } from "utils/fields";
import { EditableAction, UncontrolledTextEditable } from "./editable";
import Select from "react-select";
import { Indexable } from "index/types/indexable";
import { LineSpan } from "index/types/json/markdown";
import { Literal } from "expression/literal";
type FieldBearingWithPosition = Indexable & Fieldbearing & { $position: LineSpan };
function fieldWithDefault<T extends FieldBearingWithPosition>(object: T, key: string, defaultVal: Literal): Field {
    if (object.field(key) != undefined) return object.field(key)!;
    return {
        key,
        value: defaultVal,
        provenance: {
            type: "inline-field",
            file: object.$file!,
            key,
            line: object.$position.end,
        },
    };
}
export function FieldCheckbox<T extends FieldBearingWithPosition>(
    props: {
        className?: string;
        key: string;
        object: T;
        defaultChecked?: boolean;
        dispatch: Dispatch<EditableAction<Field>>;
    } & React.HTMLProps<HTMLInputElement>
) {
    const { key, object, defaultChecked = false, dispatch, ...rest } = props;
    const field = fieldWithDefault(object, key, defaultChecked);
    return (
        <Checkbox
            {...rest}
            disabled={undefined}
            defaultChecked={(field?.value ?? defaultChecked) as boolean}
            onCheckChange={useSetField(field, (b) =>
                dispatch({ type: "content-changed", newValue: { ...field, value: b } })
            )}
            checked={undefined}
        />
    );
}

export function EditableTextField<T extends FieldBearingWithPosition>(props: {
    key: string;
    object: T;
    inline: boolean;
    defaultValue: string;
    dispatch: Dispatch<EditableAction<string>>;
}) {
    const { key, object, defaultValue = "", inline, dispatch } = props;
    const field = fieldWithDefault(object, key, defaultValue);
    return (
        <ControlledEditableTextField
            text={(field?.value ?? defaultValue) as string}
            inline={inline}
            dispatch={dispatch}
        />
    );
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

export function FieldSlider<T extends FieldBearingWithPosition>(
    props: {
        className: string;
        min: number;
        max: number;
        step: number;
        defaultValue: number;
        key: string;
        object: T;
        dispatch: Dispatch<EditableAction<Field>>;
    } & Omit<React.HTMLProps<HTMLInputElement>, Omittable>
) {
    const { key, object, dispatch, defaultValue = 0, min, max, step, ...rest } = props;
    const field = fieldWithDefault(object, key, defaultValue);
    const value = (field?.value ?? defaultValue) as number;
    return (
        <Slider
            {...rest}
            disabled={false}
            defaultValue={value}
            min={min}
            max={max}
            step={step}
            value={undefined}
            onValueChange={useSetField(field, (b) =>
                dispatch({ type: "content-changed", newValue: { ...field, value: b } })
            )}
        />
    );
}

export function FieldSwitch<T extends FieldBearingWithPosition>(
    props: {
        className?: string;
        disabled?: boolean;
        defaultValue: boolean;
        key: string;
        object: T;
        dispatch: Dispatch<EditableAction<Field>>;
    } & Omit<React.HTMLProps<HTMLInputElement>, Omittable>
) {
    const { key, object, dispatch, defaultValue = false, ...rest } = props;
    const field = fieldWithDefault(object, key, defaultValue);
    return (
        <Switch
            {...rest}
            onToggleChange={useSetField(field, (b) =>
                dispatch({ type: "content-changed", newValue: { ...field, value: b } })
            )}
            defaultChecked={(field?.value ?? defaultValue) as boolean}
            checked={undefined}
        />
    );
}

export function FieldSelect<T extends FieldBearingWithPosition>({
    multi = false,
    options,
    defaultValue,
    key,
    object,
    dispatch,
}: {
    multi?: boolean;
    defaultValue: string | string[];
    key: string;
    object: T;
    options: { value: string; label: string }[];
    dispatch: Dispatch<EditableAction<Field>>;
}) {
    const field = fieldWithDefault(object, key, defaultValue);
    const innerCallback = useSetField(field, (b) =>
        dispatch({ type: "content-changed", newValue: { ...field, value: b } })
    );
    const onChange = useCallback((newValue: any) => {
        let normalized;
        if (Array.isArray(newValue)) {
            normalized = newValue.map((x) => x.value);
        } else {
            normalized = newValue.value;
        }
        innerCallback(normalized);
    }, []);

    const arrayVal = useMemo(
        () => (Array.isArray(field?.value) ? field.value : !!field ? [field.value] : [defaultValue]),
        [field]
    );
    const defVal = useMemo(
        () =>
            multi
                ? options.filter((a) => arrayVal.findIndex((b) => b == a.value) != -1)
                : options.find((a) => a.value == field?.value),
        [options, multi]
    );
    return (
        <Select
            classNamePrefix="datacore-selectable"
            onChange={(n) => onChange(n)}
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
