/**
 * WhatsApp Flow JSON Definitions
 *
 * Pre-built Flow JSON for legal practice use cases:
 * 1. Case Intake — collect client info, case type, description
 * 2. Appointment Booking — select date/time for consultation
 *
 * These are static Flow definitions that can be registered with Meta's
 * Flows API. Dynamic data is provided by the Flow Data Endpoint.
 */

export const CASE_INTAKE_FLOW = {
  version: "5.0",
  data_api_version: "3.0",
  routing_model: {
    INTAKE_FORM: ["REVIEW"],
    REVIEW: ["INTAKE_FORM", "SUCCESS"],
  },
  screens: [
    {
      id: "INTAKE_FORM",
      title: "Neue Akte erfassen",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Form",
            name: "case_intake_form",
            children: [
              {
                type: "TextInput",
                label: "Mandant Name",
                name: "client_name",
                required: true,
                placeholder: "Vor- und Nachname",
              },
              {
                type: "TextInput",
                label: "Gegner Name",
                name: "opponent_name",
                required: false,
                placeholder: "Gegnerische Partei",
              },
              {
                type: "Dropdown",
                label: "Rechtsgebiet",
                name: "legal_area",
                required: true,
                data: "${data.legal_areas}",
                "on-select-action": {
                  name: "update_data",
                  payload: {},
                },
              },
              {
                type: "TextArea",
                label: "Sachverhalt",
                name: "description",
                required: true,
                placeholder: "Kurze Beschreibung des Falls",
                helper_text: "Maximal 500 Zeichen",
              },
              {
                type: "TextInput",
                label: "Aktenzeichen (optional)",
                name: "case_number",
                required: false,
                placeholder: "z.B. 2026-014",
              },
            ],
          },
          {
            type: "Footer",
            label: "Weiter",
            "on-click-action": {
              name: "data_exchange",
              payload: {
                action: "review_intake",
                client_name: "${form.client_name}",
                opponent_name: "${form.opponent_name}",
                legal_area: "${form.legal_area}",
                description: "${form.description}",
                case_number: "${form.case_number}",
              },
            },
          },
        ],
      },
    },
    {
      id: "REVIEW",
      title: "Angaben prüfen",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "Bitte prüfen Sie Ihre Angaben",
          },
          {
            type: "TextBody",
            text: "Mandant: ${data.client_name}",
          },
          {
            type: "TextBody",
            text: "Gegner: ${data.opponent_name || 'nicht angegeben'}",
          },
          {
            type: "TextBody",
            text: "Rechtsgebiet: ${data.legal_area_label}",
          },
          {
            type: "TextBody",
            text: "Sachverhalt: ${data.description}",
          },
          {
            type: "TextBody",
            text: "Aktenzeichen: ${data.case_number || 'wird automatisch vergeben'}",
          },
          {
            type: "Footer",
            label: "Akte anlegen",
            "on-click-action": {
              name: "data_exchange",
              payload: {
                action: "create_case",
                client_name: "${data.client_name}",
                opponent_name: "${data.opponent_name}",
                legal_area: "${data.legal_area}",
                description: "${data.description}",
                case_number: "${data.case_number}",
              },
            },
          },
        ],
      },
    },
    {
      id: "SUCCESS",
      title: "Akte angelegt",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "✅ Akte erfolgreich angelegt",
          },
          {
            type: "TextBody",
            text: "Aktenzeichen: ${data.case_number}",
          },
          {
            type: "TextBody",
            text: "Die Akte wurde im Kanzlei-OS Brain gespeichert und ist im Dashboard verfügbar.",
          },
          {
            type: "Footer",
            label: "Fertig",
            "on-click-action": {
              name: "complete",
              payload: {
                case_slug: "${data.case_slug}",
                case_number: "${data.case_number}",
              },
            },
          },
        ],
      },
    },
  ],
};

export const APPOINTMENT_BOOKING_FLOW = {
  version: "5.0",
  data_api_version: "3.0",
  routing_model: {
    DATE_SELECT: ["TIME_SELECT"],
    TIME_SELECT: ["DATE_SELECT", "CONFIRM"],
    CONFIRM: ["TIME_SELECT", "SUCCESS"],
  },
  screens: [
    {
      id: "DATE_SELECT",
      title: "Termin buchen — Datum",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "Wann möchten Sie einen Termin?",
          },
          {
            type: "DatePicker",
            label: "Datum auswählen",
            name: "appointment_date",
            required: true,
            mode: "single",
            "on-select-action": {
              name: "data_exchange",
              payload: {
                action: "get_slots",
                selected_date: "${form.appointment_date}",
              },
            },
          },
          {
            type: "Footer",
            label: "Weiter",
            "on-click-action": {
              name: "navigate",
              payload: {
                screen: "TIME_SELECT",
                data: {
                  selected_date: "${form.appointment_date}",
                },
              },
            },
          },
        ],
      },
    },
    {
      id: "TIME_SELECT",
      title: "Termin buchen — Uhrzeit",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "Verfügbare Termine am ${data.selected_date}",
          },
          {
            type: "RadioGroup",
            label: "Uhrzeit",
            name: "selected_slot",
            required: true,
            data: "${data.available_slots}",
          },
          {
            type: "TextInput",
            label: "Thema (optional)",
            name: "topic",
            required: false,
            placeholder: "z.B. Erstabklärung, Vertragsprüfung",
          },
          {
            type: "Footer",
            label: "Weiter",
            "on-click-action": {
              name: "data_exchange",
              payload: {
                action: "review_appointment",
                selected_date: "${data.selected_date}",
                selected_slot: "${form.selected_slot}",
                topic: "${form.topic}",
              },
            },
          },
        ],
      },
    },
    {
      id: "CONFIRM",
      title: "Termin bestätigen",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "Termin bestätigen",
          },
          {
            type: "TextBody",
            text: "Datum: ${data.appointment_date}",
          },
          {
            type: "TextBody",
            text: "Uhrzeit: ${data.appointment_time}",
          },
          {
            type: "TextBody",
            text: "Thema: ${data.topic || 'Allgemeine Beratung'}",
          },
          {
            type: "Footer",
            label: "Termin buchen",
            "on-click-action": {
              name: "data_exchange",
              payload: {
                action: "book_appointment",
                appointment_date: "${data.appointment_date}",
                appointment_time: "${data.appointment_time}",
                topic: "${data.topic}",
              },
            },
          },
        ],
      },
    },
    {
      id: "SUCCESS",
      title: "Termin gebucht",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "✅ Termin bestätigt",
          },
          {
            type: "TextBody",
            text: "Ihr Termin am ${data.appointment_date} um ${data.appointment_time} wurde gebucht.",
          },
          {
            type: "TextBody",
            text: "Sie erhalten eine Erinnerung 24h vor dem Termin.",
          },
          {
            type: "Footer",
            label: "Fertig",
            "on-click-action": {
              name: "complete",
              payload: {
                appointment_id: "${data.appointment_id}",
              },
            },
          },
        ],
      },
    },
  ],
};

export const FLOW_DEFINITIONS: Record<string, unknown> = {
  case_intake: CASE_INTAKE_FLOW,
  appointment_booking: APPOINTMENT_BOOKING_FLOW,
};
