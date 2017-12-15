import { observable } from "mobx";
const titleCase = require("title-case");
//import * as assert from "assert";

export interface IFieldDefinition {
  key: string;
  englishLabel?: string;
  defaultValue?: string;
  type: string;
  form: string; // what form this shows on, if not the main one
  //visibility?: string;
  cssClass?: string;
  choices?: string[];
}

export enum FieldType {
  Text,
  Date,
  Image
}
export enum FieldVisibility {
  Always,
  IfNotEmpty
}
export class Field {
  public readonly key: string;
  public readonly englishLabel: string; // just for debugging at this point
  public readonly type: FieldType;
  public readonly form: string; // where to show it
  public readonly visibility: FieldVisibility;
  public readonly cssClass: string;
  @observable public text = new Map();

  // these definitions normally come from fields.json, which in turn can come form a google spreadsheet with json export
  public static fromFieldDefinition(definition: IFieldDefinition): Field {
    if (!definition.form || definition.form.length === 0) {
      definition.form = "primary";
    }
    const type = definition.type
      ? FieldType[definition.type as keyof typeof FieldType]
      : FieldType.Text;

    switch (type) {
      case FieldType.Text:
        const choices = definition.choices ? definition.choices : [];
        return new TextField(
          definition.key,
          definition.defaultValue,
          definition.englishLabel,
          definition.form,
          FieldVisibility.Always, //todo
          choices,
          definition.cssClass
        );
      case FieldType.Date:
        return new DateField(
          definition.key,
          new Date(), // fix
          definition.englishLabel,
          definition.form,
          FieldVisibility.Always, //todo
          definition.cssClass
        );
      default:
        throw new RangeError("Uknown field type");
    }
  }

  public constructor(
    key: string,
    englishLabel: string = titleCase(key),
    form: string = "",
    type: FieldType = FieldType.Text,
    visibility: FieldVisibility = FieldVisibility.Always,
    cssClass: string = ""
  ) {
    this.key = key;
    this.englishLabel = englishLabel;
    this.form = form;
    this.type = type;
    this.visibility = visibility;
    this.cssClass = cssClass;
  }

  get english(): string {
    return this.text.get("en");
  }
  set english(value: string) {
    //console.log(this.englishLabel + ":setDefault(" + value + ")");
    this.text.set("en", value);
  }
  public toString(): string {
    return this.english;
  }
  public setValueFromString(s: string): any {
    this.english = s;
  }

  public stringify(): string {
    throw new Error("Subclasses must implement stringify");
  }
  // public objectForSerializing(): object {
  //   throw new Error("Subclasses must implement objectForSerializing");
  // }

  //https://stackoverflow.com/questions/4253367/how-to-escape-a-json-string-containing-newline-characters-using-javascript
  protected static escapeSpecialChars(s: string): string {
    return s
      .replace(/\\n/g, "\\n")
      .replace(/\\'/g, "\\'")
      .replace(/\\"/g, '\\"')
      .replace(/\\&/g, "\\&")
      .replace(/\\r/g, "\\r")
      .replace(/\\t/g, "\\t")
      .replace(/\\b/g, "\\b")
      .replace(/\\f/g, "\\f");
  }
}

export class DateField extends Field {
  public date: Date;
  constructor(
    key: string,
    defaultValue: Date,
    englishLabel: string = titleCase(key),
    form: string = "",
    visibility: FieldVisibility = FieldVisibility.Always,
    cssClass: string = ""
  ) {
    super(key, englishLabel, form, FieldType.Date, visibility, cssClass);
    this.date = defaultValue;
  }

  public toString(): string {
    return this.date.toLocaleDateString();
  }
  public stringify(): string {
    return `"${this.key}":"${this.date.toISOString()}"`;
  }
  // public objectForSerializing(): object {
  //   return { [this.key]: this.date.toISOString() };
  // }
  public setDate(date: Date) {
    this.date = date;
  }
  public setValueFromString(s: string): any {
    this.date = new Date(s);
  }
}

export class TextField extends Field {
  @observable public text = new Map();
  public choices: string[];

  constructor(
    key: string,
    englishValue: string = "",
    englishLabel: string = titleCase(key),
    form: string = "",
    visibility: FieldVisibility = FieldVisibility.Always,
    choices: string[] = [],
    cssClass: string = ""
  ) {
    super(key, englishLabel, form, FieldType.Text, visibility, cssClass);
    this.choices = choices;
    this.text.set("en", englishValue);
  }
  get english(): string {
    return this.text.get("en");
  }
  set english(value: string) {
    //console.log(this.englishLabel + ":setDefault(" + value + ")");
    this.text.set("en", value);
  }
  public toString(): string {
    return this.english;
  }
  public stringify(): string {
    return `"${this.key}":"${Field.escapeSpecialChars(this.english)}"`;
  }
  // public objectForSerializing(): object {
  //   return { [this.key]: Field.escapeSpecialChars(this.english) };
  // }
  public setValueFromString(s: string): any {
    this.english = s;
  }
}
