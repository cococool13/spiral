use serde_json::{json, Map, Value};

pub fn normalize_stored(value: Value) -> Result<Value, String> {
    let mut root = match value {
        Value::Object(map) => map,
        _ => {
            return Err(
                "Could not read the saved resume: the file is not a document. The file was left in place."
                    .into(),
            )
        }
    };
    let doc = root.get("doc").cloned().unwrap_or(Value::Null);
    root.insert("doc".into(), normalize_doc(doc));
    fill_string(&mut root, "savedAt");
    fill_string(&mut root, "template");
    fill_string(&mut root, "format");
    fill_string(&mut root, "accent");
    if !matches!(root.get("tighten"), Some(Value::Bool(_))) {
        root.insert("tighten".into(), Value::Bool(false));
    }
    Ok(Value::Object(root))
}

fn normalize_doc(value: Value) -> Value {
    let obj = value.as_object();
    json!({
        "contact": normalize_contact(obj.and_then(|map| map.get("contact"))),
        "headline": text(obj, "headline"),
        "summary": text(obj, "summary"),
        "experience": roles(obj, "experience"),
        "education": schools(obj, "education"),
        "projects": roles(obj, "projects"),
        "leadership": roles(obj, "leadership"),
        "awards": strings(obj.and_then(|map| map.get("awards"))),
        "interests": strings(obj.and_then(|map| map.get("interests"))),
        "skills": skills(obj.and_then(|map| map.get("skills"))),
    })
}

fn normalize_contact(value: Option<&Value>) -> Value {
    let obj = value.and_then(Value::as_object);
    json!({
        "name": text(obj, "name"),
        "email": text(obj, "email"),
        "phone": text(obj, "phone"),
        "location": text(obj, "location"),
        "links": strings(obj.and_then(|map| map.get("links"))),
    })
}

fn roles(obj: Option<&Map<String, Value>>, key: &str) -> Value {
    let Some(Value::Array(items)) = obj.and_then(|map| map.get(key)) else {
        return json!([]);
    };
    Value::Array(items.iter().map(normalize_role).collect())
}

fn normalize_role(value: &Value) -> Value {
    let obj = value.as_object();
    json!({
        "id": text(obj, "id"),
        "title": text(obj, "title"),
        "organization": text(obj, "organization"),
        "location": text(obj, "location"),
        "start": date(obj.and_then(|map| map.get("start"))),
        "end": date(obj.and_then(|map| map.get("end"))),
        "bullets": bullets(obj.and_then(|map| map.get("bullets"))),
    })
}

fn schools(obj: Option<&Map<String, Value>>, key: &str) -> Value {
    let Some(Value::Array(items)) = obj.and_then(|map| map.get(key)) else {
        return json!([]);
    };
    Value::Array(items.iter().map(normalize_school).collect())
}

fn normalize_school(value: &Value) -> Value {
    let obj = value.as_object();
    json!({
        "id": text(obj, "id"),
        "institution": text(obj, "institution"),
        "credential": text(obj, "credential"),
        "location": text(obj, "location"),
        "start": date(obj.and_then(|map| map.get("start"))),
        "end": date(obj.and_then(|map| map.get("end"))),
        "notes": bullets(obj.and_then(|map| map.get("notes"))),
    })
}

fn date(value: Option<&Value>) -> Value {
    let obj = value.and_then(Value::as_object);
    json!({
        "raw": text(obj, "raw"),
        "year": year(obj),
        "month": month(obj),
        "present": matches!(obj.and_then(|map| map.get("present")), Some(Value::Bool(true))),
    })
}

fn year(obj: Option<&Map<String, Value>>) -> Value {
    match obj.and_then(|map| map.get("year")).and_then(Value::as_u64) {
        Some(value) if value <= u64::from(u16::MAX) => json!(value),
        _ => Value::Null,
    }
}

fn month(obj: Option<&Map<String, Value>>) -> Value {
    match obj.and_then(|map| map.get("month")).and_then(Value::as_u64) {
        Some(value) if (1..=12).contains(&value) => json!(value),
        _ => Value::Null,
    }
}

fn bullets(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return json!([]);
    };
    Value::Array(
        items
            .iter()
            .map(|item| {
                let obj = item.as_object();
                json!({
                    "id": text(obj, "id"),
                    "text": text(obj, "text"),
                })
            })
            .collect(),
    )
}

fn skills(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return json!([]);
    };
    if items.is_empty() {
        return json!([]);
    }
    if items.iter().all(Value::is_string) {
        return json!([{
            "label": "",
            "items": items,
        }]);
    }
    Value::Array(
        items
            .iter()
            .map(|item| {
                let obj = item.as_object();
                json!({
                    "label": text(obj, "label"),
                    "items": strings(obj.and_then(|map| map.get("items"))),
                })
            })
            .collect(),
    )
}

fn strings(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return json!([]);
    };
    Value::Array(
        items
            .iter()
            .filter_map(|item| item.as_str().map(|text| Value::String(text.to_string())))
            .collect(),
    )
}

fn text(obj: Option<&Map<String, Value>>, key: &str) -> String {
    obj.and_then(|map| map.get(key))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn fill_string(root: &mut Map<String, Value>, key: &str) {
    if !matches!(root.get(key), Some(Value::String(_))) {
        root.insert(key.into(), Value::String(String::new()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_legacy_store_fixture_gains_defaults_and_grouped_skills() {
        let legacy = r#"{"doc":{"contact":{"name":"Ada","email":"","phone":"","location":"","links":[]},"summary":"","experience":[],"education":[],"projects":[],"skills":["Rust","Analysis"]},"savedAt":"2026-08-11T10:00:00Z","template":"column"}"#;
        let value = normalize_stored(serde_json::from_str(legacy).unwrap()).unwrap();
        assert_eq!(value["doc"]["contact"]["name"], "Ada");
        assert_eq!(value["doc"]["headline"], "");
        assert_eq!(value["doc"]["skills"][0]["label"], "");
        assert_eq!(value["doc"]["skills"][0]["items"][0], "Rust");
        assert_eq!(value["doc"]["skills"][0]["items"][1], "Analysis");
        assert_eq!(value["accent"], "");
        assert_eq!(value["tighten"], false);
        assert_eq!(value["template"], "column");
    }
}
