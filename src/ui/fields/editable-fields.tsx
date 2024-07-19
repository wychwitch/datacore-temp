import { Checkbox, Slider, Switch } from "api/ui/basics";
import { Field } from "expression/field";
import { Dispatch, useCallback, useState } from "preact/hooks";
import { useFinalizer, useSetField } from "utils/fields";
import { EditableAction, UncontrolledTextEditable } from "./editable";
import Select from "react-select";

export function FieldCheckbox(
    props: { className?: string; field: Field; defaultChecked?: boolean } & React.HTMLProps<HTMLInputElement>
) {
    const { field, defaultChecked, ...rest } = props;
    return (
        <Checkbox
            {...rest}
            disabled={undefined}
            defaultChecked={defaultChecked}
            onCheckChange={useSetField(field)}
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
    } & React.HTMLProps<HTMLInputElement>
) {
    const { field, min, max, step, ...rest } = props;
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
            onValueChange={useSetField(field)}
        />
    );
}

export function FieldSwitch(
    props: {
        className?: string;
        disabled?: boolean;
        field: Field;
    } & React.HTMLProps<HTMLInputElement>
) {
    const { field, ...rest } = props;
    return (
        <Switch
            {...rest}
            onToggleChange={useSetField(field)}
            defaultChecked={field.value as boolean}
            checked={undefined}
        />
    );
}

export function FieldSelect({
    onUpdate,
    field,
    multi = false,
    options,
}: {
    onUpdate: (v: string | string[]) => void;
    field: Field;
    multi?: boolean;
    options: { value: string; label: string }[];
}) {
    const onChange = useCallback((newValue: any) => {
        onUpdate(newValue as string | string[]);
    }, []);
    return (
        <Select
            classNamePrefix="datacore-selectable"
            onChange={onChange}
            unstyled
            isMulti={multi ?? false}
            options={options ?? []}
            menuPortalTarget={document.body}
            value={field.value}
            classNames={{
                input: (props: any) => "prompt-input",
                valueContainer: (props: any) => "suggestion-item value-container",
                container: (props: any) => "suggestion-container",
                menu: (props: any) => "suggestion-content suggestion-container",
                option: (props: any) => `suggestion-item${props.isSelected ? " is-selected" : ""}`,
            }}
        />
    );
}
