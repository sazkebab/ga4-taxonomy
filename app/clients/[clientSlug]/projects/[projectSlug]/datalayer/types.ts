export interface EcommerceNote {
  id:        string
  sectionId: string
  fieldPath: string
  notes:     string
}

export interface ParamNote {
  id:        string
  sectionId: string
  paramName: string
  example:   string
  notes:     string
}

export interface Comment {
  id:        string
  sectionId: string
  body:      string
  createdAt: string
}

export interface Screenshot {
  id:        string
  filename:  string
  createdAt: string
  context:   string   // "trigger" | "test"
}

export interface EventParam {
  parameterId: string   // id of the Parameter record
  value:       string   // "dynamic" or a constant
  parameter: {
    name:        string
    description: string
    type:        string
    example:     string
  }
}

export interface SectionEvent {
  id:         string
  name:       string
  category:   string
  trigger:    string
  parameters: EventParam[]
}

export interface Section {
  id:                 string
  eventId:            string
  order:              number
  codeBlock:          string
  codeBlockCustomised: boolean
  ecommerceJson:      string
  testUrl:            string
  isDone:             boolean
  isTested:           boolean
  testResult:         string | null
  event:              SectionEvent
  comments:           Comment[]
  paramNotes:         ParamNote[]
  ecommerceNotes:     EcommerceNote[]
  screenshots:        Screenshot[]
}

export interface Doc {
  id:              string
  gtmContainerId:  string
  sections:        Section[]
}
