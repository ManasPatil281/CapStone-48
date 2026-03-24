import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentAttempt, ContentTabData, LearningObjectDetail, LearningObject } from "@/types/learning";
import { LOHeader } from "@/components/lo/LOHeader";
import { LODetailTabs } from "@/components/lo/LODetailTabs";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";

interface PageProps {
  params: {
    loSlug: string;
  };
}

export default async function LODetailPage({ params }: PageProps) {
  const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const supabase = hasSupabaseEnv ? createSupabaseServerClient() : null;

  let userId: string | undefined;
  let loDetail: LearningObjectDetail | null = null;
  let attempts: AssessmentAttempt[] = [];
  let progressMap: Map<string, any> | null = null;

  if (supabase) {
    const { data: { user } = { user: null } } = await supabase.auth.getUser();
    userId = user?.id ?? undefined;

    const { data: learningObject, error } = await supabase.from("learning_object").select("*").eq("slug", params.loSlug).maybeSingle();

    if (!error && learningObject) {
      const [contentRes, prereqRes, dependentsRes, assessmentRes, attemptsRes] = await Promise.all([
        supabase.from("learning_object_content").select("*, delivery_type:delivery_type_id(*)").eq("learning_object_id", learningObject.id).eq("is_active", true).order("sequence_order", { ascending: true }),
        supabase
          .from("learning_object_prerequisite")
          .select("prerequisite:learning_object!learning_object_prerequisite_prerequisite_lo_id_fkey (*)")
          .eq("learning_object_id", learningObject.id),
        supabase
          .from("learning_object_prerequisite")
          .select("dependent:learning_object!learning_object_prerequisite_learning_object_id_fkey (*)")
          .eq("prerequisite_lo_id", learningObject.id),
        supabase
          .from("lo_assessment")
          .select("*, lo_question(*, lo_question_option(*))")
          .eq("learning_object_id", learningObject.id)
          .maybeSingle(),
        userId ? supabase.from("user_assessment_attempt").select("*").eq("user_id", userId).order("attempt_number", { ascending: false }) : Promise.resolve({ data: [], error: null })
      ]);

      if (contentRes.error) {
        throw contentRes.error;
      }

      loDetail = {
        ...learningObject,
        contents: contentRes.data ?? [],
        deliveryTypes: {},
        prerequisites: (prereqRes.data?.map((row: any) => row.prerequisite as LearningObject) ?? []).filter(Boolean),
        dependents: (dependentsRes.data?.map((row: any) => row.dependent as LearningObject) ?? []).filter(Boolean),
        assessment: assessmentRes.data
          ? {
              ...assessmentRes.data,
              questions: assessmentRes.data.lo_question ?? []
            }
          : undefined,
        progress: undefined
      };

      const prerequisiteLOs = loDetail.prerequisites;
      const dependentLOs = loDetail.dependents;

      const progressIds = [loDetail.id, ...prerequisiteLOs.map((pr) => pr.id), ...dependentLOs.map((dep) => dep.id)];
      const progressRes = userId && progressIds.length > 0 ? await supabase.from("user_learning_progress").select("*").eq("user_id", userId).in("learning_object_id", progressIds) : null;
      const progressEntries = progressRes?.data?.map((row) => [row.learning_object_id, row]) ?? [];
      progressMap = new Map(progressEntries);
      loDetail.progress = progressMap.get(loDetail.id);
      attempts = attemptsRes.data ?? [];
    }
  }

  if (!loDetail && params.loSlug === "linked-list") {
    loDetail = buildMockLinkedListDetail();
    progressMap = buildMockProgressMap(loDetail);
    attempts = [];
  }

  if (!loDetail) {
    notFound();
  }

  const contentTabs = mapContentTabs(loDetail.contents);
  const recommendedTab = pickRecommendedTab(loDetail.contents);
  const roadmap = buildRoadmap({
    lo: loDetail,
    prerequisites: loDetail.prerequisites,
    dependents: loDetail.dependents,
    progressMap
  });

  // Build course roadmap with most-taken path highlighting
  const courseRoadmapData = buildMockDSACourseRoadmap();

  return (
    <div className="space-y-10 p-6">
      <LOHeader lo={loDetail} />
      <LODetailTabs
        content={contentTabs}
        roadmap={roadmap}
        courseRoadmap={{
          nodes: courseRoadmapData.nodes,
          edges: courseRoadmapData.edges,
          mostTakenPathNodeIds: courseRoadmapData.mostTakenPathNodeIds
        }}
        assessment={loDetail.assessment}
        attempts={attempts}
        recommendedTab={recommendedTab}
      />
    </div>
  );
}

function mapContentTabs(contents: LearningObjectDetail["contents"]): ContentTabData {
  return contents.reduce<ContentTabData>((acc, item) => {
    const code = item.delivery_type?.code;
    const assign = (key: keyof ContentTabData) => {
      acc[key] = acc[key] ?? [];
      acc[key]!.push(item);
    };

    switch (code) {
      case "VIDEO":
        assign("video");
        break;
      case "READING_NOTES":
        assign("notes");
        break;
      case "READING_PDF":
        assign("pdf");
        break;
      case "PLAYGROUND":
        assign("playground");
        break;
      case "FLASHCARD":
        assign("flashcards");
        break;
      default:
        break;
    }
    return acc;
  }, {} as ContentTabData);
}

function pickRecommendedTab(contents: LearningObjectDetail["contents"]) {
  const priority = ["PLAYGROUND", "VIDEO", "READING_NOTES", "READING_PDF"];
  for (const code of priority) {
    if (contents.some((content) => content.delivery_type?.code === code)) {
      switch (code) {
        case "PLAYGROUND":
          return "playground";
        case "VIDEO":
          return "video";
        case "READING_NOTES":
          return "notes";
        case "READING_PDF":
          return "pdf";
        default:
          break;
      }
    }
  }
  return undefined;
}

function buildRoadmap({
  lo,
  prerequisites,
  dependents,
  progressMap
}: {
  lo: LearningObjectDetail;
  prerequisites: LearningObject[];
  dependents: LearningObject[];
  progressMap: Map<string, any> | null;
}): { nodes: RoadmapNode[]; edges: RoadmapEdge[] } {
  const nodes: RoadmapNode[] = [
    ...prerequisites.map((pr) => ({
      id: pr.id,
      title: pr.title,
      difficulty: pr.difficulty_level,
      estimatedTime: pr.estimated_time_minutes,
      status: (progressMap?.get(pr.id)?.status as RoadmapNode["status"]) ?? "NOT_STARTED"
    })),
    {
      id: lo.id,
      title: lo.title,
      difficulty: lo.difficulty_level,
      estimatedTime: lo.estimated_time_minutes,
      status: (progressMap?.get(lo.id)?.status as RoadmapNode["status"]) ?? (lo.progress?.status as RoadmapNode["status"]) ?? "IN_PROGRESS"
    },
    ...dependents.map((dep) => ({
      id: dep.id,
      title: dep.title,
      difficulty: dep.difficulty_level,
      estimatedTime: dep.estimated_time_minutes,
      status: (progressMap?.get(dep.id)?.status as RoadmapNode["status"]) ?? "NOT_STARTED"
    }))
  ];

  const edges: RoadmapEdge[] = [
    ...prerequisites.map((pr) => ({ source: pr.id, target: lo.id })),
    ...dependents.map((dep) => ({ source: lo.id, target: dep.id }))
  ];

  return { nodes, edges };
}

function buildMockLinkedListDetail(): LearningObjectDetail {
  const loId = "mock-linked-list";
  const prerequisites: LearningObject[] = [
    {
      id: "mock-arrays",
      title: "Arrays",
      slug: "arrays",
      description: "Understand contiguous memory structures and indexing.",
      difficulty_level: 1,
      estimated_time_minutes: 30,
      status: "published"
    },
    {
      id: "mock-pointers",
      title: "Pointers & References",
      slug: "pointers-references",
      description: "Work with memory addresses and references.",
      difficulty_level: 2,
      estimated_time_minutes: 25,
      status: "published"
    }
  ];

  const dependents: LearningObject[] = [
    {
      id: "mock-singly-ll",
      title: "Singly Linked List",
      slug: "singly-linked-list",
      description: "Standard linked list with single next pointer.",
      difficulty_level: 3,
      estimated_time_minutes: 20,
      status: "published"
    },
    {
      id: "mock-doubly-ll",
      title: "Doubly Linked List",
      slug: "doubly-linked-list",
      description: "Linked list with bidirectional traversal.",
      difficulty_level: 3,
      estimated_time_minutes: 25,
      status: "published"
    },
    {
      id: "mock-circular-ll",
      title: "Circular Linked List",
      slug: "circular-linked-list",
      description: "Linked list where last node points to first.",
      difficulty_level: 4,
      estimated_time_minutes: 20,
      status: "published"
    },
    {
      id: "mock-stack",
      title: "Stack",
      slug: "stack",
      description: "Last-in-first-out data structure built atop linked lists.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published"
    },
    {
      id: "mock-queue",
      title: "Queue",
      slug: "queue",
      description: "First-in-first-out structure and variations.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published"
    }
  ];

  const videoLinks = [
    { title: "Linked List Crash Course", url: "https://youtu.be/LyuuqCVkP5I?si=1lYGokGPCmOVYT4k" },
    { title: "Pointers + Linked Lists Visualized", url: "https://youtu.be/R-CKBYnOv1U?si=RR6miKw3wLAqN7WU" },
    { title: "Linked List Problem Walkthroughs", url: "https://youtu.be/nzaHG0dme4g?si=w0zzdtPNWyBtbEkJ" },
    { title: "Insertion & Deletion Mastery", url: "https://youtu.be/-1E8ZMS0gSs?si=anNHW0u1eON-Xtwc" },
    { title: "Live Linked List Debugging", url: "https://youtu.be/-1E8ZMS0gSs?si=aMP24_kARTc_hmCV" },
    { title: "Reverse Linked Lists Step-by-Step", url: "https://youtu.be/f8RPIb-0DDE?si=hhLEtUJax-PtaDhL" },
    { title: "Linked List Interview Prep", url: "https://youtu.be/8ze7Zopdsaw?si=JizO7_Zw5KNcOhP-" },
    { title: "Cycle Detection Patterns", url: "https://youtu.be/bO5DasTsaRQ?si=-C6aVPOYq5phXpfq" },
    { title: "Doubly Linked Lists Explained", url: "https://youtu.be/e6lZY5Yha8U?si=L_XTz0Rtf7UoAXcA" },
    { title: "Linked List + Stack Hybrids", url: "https://youtu.be/-swgIiMIlJo?si=JGSd-SIwnv6lDzOJ" },
    { title: "Queue via Linked List", url: "https://youtu.be/wwbTMNVlFHQ?si=cmVpewZh24klUk4O" },
    { title: "Mastering Edge Cases", url: "https://youtu.be/GsY6y0iPaHw?si=gthSZ96IYi0-sP-H" }
  ];

  const videoContents = videoLinks.map((video, index) => ({
    id: `mock-video-${index + 1}`,
    learning_object_id: loId,
    delivery_type_id: "VIDEO",
    title: video.title,
    content_json: {
      url: video.url
    },
    sequence_order: index + 1,
    is_active: true,
    delivery_type: { id: "VIDEO", code: "VIDEO", name: "Video Lecture" }
  }));

  let sequenceOrder = videoContents.length + 1;

  const contents = [
    ...videoContents,
    {
      id: "mock-notes",
      learning_object_id: loId,
      delivery_type_id: "READING_NOTES",
      title: "Linked List Notes",
      content_json: {
        markdown: `## Linked List Comprehensive Guide

### Node Structure
A linked list is made up of nodes, where each node contains:
- **data**: The actual value stored in the node
- **next**: A pointer/reference to the next node in the list (or null if it's the last node)

\`\`\`python
class Node:
    def __init__(self, data, next=None):
        self.data = data
        self.next = next
\`\`\`

### Core Concepts

#### Head Pointer
- Points to the first node in the linked list
- Essential for accessing and traversing the list
- If head is None, the list is empty

#### Traversal
Traversing involves visiting each node starting from head:
\`\`\`python
def print_list(head):
    current = head
    while current:  # Keep going until we hit None
        print(current.data, end=" -> ")
        current = current.next
    print("None")
\`\`\`

**Time Complexity**: O(n) where n is the number of nodes

### Basic Operations

#### Insertion at Head - O(1)
Adding a new node at the beginning is efficient:
1. Create new node
2. Set new node's next to current head
3. Update head to point to new node

\`\`\`python
def insert_at_head(head, data):
    new_node = Node(data)
    new_node.next = head
    return new_node  # Return new head
\`\`\`

#### Insertion at End - O(n)
To add at the end, we must traverse to find the last node:
1. Traverse until we find a node where next is None
2. Create new node
3. Set last node's next to new node

#### Deletion - O(n)
To delete a node by value:
1. Traverse the list
2. When found, update the previous node's next pointer
3. Special case: if deleting head, update head reference

#### Reversal - O(n)
Three pointers technique (prev, current, next):
\`\`\`python
def reverse(head):
    prev, current = None, head
    while current:
        next_temp = current.next  # Save next node
        current.next = prev       # Reverse the link
        prev = current            # Move prev forward
        current = next_temp       # Move current forward
    return prev  # New head
\`\`\`

### Time & Space Complexity

| Operation | Time | Space |
|-----------|------|-------|
| Access | O(n) | O(1) |
| Search | O(n) | O(1) |
| Insert at head | O(1) | O(1) |
| Append at end | O(n) | O(1) |
| Delete | O(n) | O(1) |
| Reverse | O(n) | O(1) |

### Common Patterns

#### Two-Pointer Technique
Useful for finding middle, detecting cycles:
\`\`\`python
# Find middle using slow and fast pointers
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
# slow is at middle
\`\`\`

#### Cycle Detection (Floyd's Algorithm)
- Use slow pointer (moves 1 step) and fast pointer (moves 2 steps)
- If they meet, cycle exists
- If fast reaches None, no cycle

### Edge Cases to Handle
1. Empty list (head is None)
2. Single node list
3. Operations on head (need to return new head)
4. Circular lists
5. None values in data

### Comparison with Arrays
- **Linked Lists**: Efficient insertion/deletion at any point (if we have the reference), uses dynamic memory
- **Arrays**: Fast random access, but insertion/deletion requires shifting elements
`
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "READING_NOTES", code: "READING_NOTES", name: "Markdown Notes" }
    },
    {
      id: "mock-pdf",
      learning_object_id: loId,
      delivery_type_id: "READING_PDF",
      title: "Linked List Reference PDF",
      content_json: {
        pdf_url: "https://example.com/linked-list.pdf",
        page_count: 12
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "READING_PDF", code: "READING_PDF", name: "PDF" }
    },
    {
      id: "mock-playground",
      learning_object_id: loId,
      delivery_type_id: "PLAYGROUND",
      title: "Linked List Playground",
      content_json: {
        language: "python",
        starter_code: `class Node:
    def __init__(self, data, next=None):
        self.data = data
        self.next = next

class LinkedList:
    def __init__(self):
        self.head = None

    def print_list(self):
        elements = []
        current = self.head
        while current:
            elements.append(str(current.data))
            current = current.next
        return " -> ".join(elements) if elements else "Empty"
`,
        practices: [
          {
            id: 1,
            title: "Insert at Head",
            description: "Add a new node with value to the beginning of the linked list. Print the result.",
            expected_output: "3 -> 2 -> 1 -> ",
            hint: "Create a new node, set its next to self.head, then update self.head"
          },
          {
            id: 2,
            title: "Delete Node",
            description: "Delete the first node with the given value from the list.",
            expected_output: "1 -> 3 -> ",
            hint: "Traverse and find the node. Update previous node's next pointer to skip the target node."
          },
          {
            id: 3,
            title: "Reverse Linked List",
            description: "Reverse the entire linked list. Print the reversed list.",
            expected_output: "1 -> 2 -> 3 -> ",
            hint: "Use three pointers: prev, current, next. Iterate and reverse the next pointers."
          }
        ]
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "PLAYGROUND", code: "PLAYGROUND", name: "Code Playground" }
    },
    {
      id: "mock-flashcards",
      learning_object_id: loId,
      delivery_type_id: "FLASHCARD",
      title: "Linked List Flashcards",
      content_json: {
        cards: [
          { front: "What does the head pointer store?", back: "Reference to the first node" },
          { front: "Time complexity to insert at head?", back: "O(1) - constant time" },
          { front: "Time complexity to append at end?", back: "O(n) - linear, must traverse" },
          { front: "Time complexity to access element at index i?", back: "O(i) or O(n) in worst case" },
          { front: "What is the worst-case search time in linked list?", back: "O(n) - must check every node" },
          { front: "How do you detect a cycle in a linked list?", back: "Floyd's algorithm: use slow (1 step) and fast (2 steps) pointers" },
          { front: "What happens when you delete the head node?", back: "Must return the new head (head.next)" },
          { front: "What is the space complexity for reversing a linked list?", back: "O(1) if iterative, O(n) if recursive (call stack)" },
          { front: "How do you find the middle of a linked list efficiently?", back: "Use two pointers: slow (1 step) and fast (2 steps)" },
          { front: "What is the main advantage of linked lists over arrays?", back: "Efficient insertion/deletion anywhere (O(1) if position is known)" }
        ]
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "FLASHCARD", code: "FLASHCARD", name: "Flashcards" }
    }
  ];

  return {
    id: loId,
    title: "Linked List",
    slug: "linked-list",
    description: "Learn traversal, insertion, deletion, and reversal of singly/doubly linked lists.",
    difficulty_level: 3,
    estimated_time_minutes: 45,
    status: "published",
    contents,
    deliveryTypes: {},
    prerequisites,
    dependents,
    assessment: {
      id: "mock-assessment",
      learning_object_id: loId,
      title: "Linked List Fundamentals",
      pass_percentage: 80,
      max_attempts: 3,
      questions: [
        {
          id: "mock-q1",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the time complexity to insert at the head of a linked list?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q1-a", question_id: "mock-q1", option_text: "O(1)", is_correct: true },
            { id: "mock-q1-b", question_id: "mock-q1", option_text: "O(n)", is_correct: false },
            { id: "mock-q1-c", question_id: "mock-q1", option_text: "O(log n)", is_correct: false },
            { id: "mock-q1-d", question_id: "mock-q1", option_text: "O(n²)", is_correct: false }
          ]
        },
        {
          id: "mock-q2",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the main disadvantage of linked lists compared to arrays?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q2-a", question_id: "mock-q2", option_text: "No random access - O(n) to access element at index i", is_correct: true },
            { id: "mock-q2-b", question_id: "mock-q2", option_text: "Uses more memory per element", is_correct: false },
            { id: "mock-q2-c", question_id: "mock-q2", option_text: "Cannot store multiple types", is_correct: false },
            { id: "mock-q2-d", question_id: "mock-q2", option_text: "Cannot be sorted", is_correct: false }
          ]
        },
        {
          id: "mock-q3",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "Which algorithm efficiently detects a cycle in a linked list?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q3-a", question_id: "mock-q3", option_text: "Floyd's Cycle Detection (Tortoise & Hare)", is_correct: true },
            { id: "mock-q3-b", question_id: "mock-q3", option_text: "Binary Search", is_correct: false },
            { id: "mock-q3-c", question_id: "mock-q3", option_text: "Quick Sort", is_correct: false },
            { id: "mock-q3-d", question_id: "mock-q3", option_text: "Bubble Sort", is_correct: false }
          ]
        },
        {
          id: "mock-q4",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the space complexity of reversing a linked list using iteration?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q4-a", question_id: "mock-q4", option_text: "O(1)", is_correct: true },
            { id: "mock-q4-b", question_id: "mock-q4", option_text: "O(n)", is_correct: false },
            { id: "mock-q4-c", question_id: "mock-q4", option_text: "O(log n)", is_correct: false },
            { id: "mock-q4-d", question_id: "mock-q4", option_text: "O(n²)", is_correct: false }
          ]
        },
        {
          id: "mock-q5",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "When deleting the head node, what must you return?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q5-a", question_id: "mock-q5", option_text: "head.next (the new head)", is_correct: true },
            { id: "mock-q5-b", question_id: "mock-q5", option_text: "head (the original head)", is_correct: false },
            { id: "mock-q5-c", question_id: "mock-q5", option_text: "None", is_correct: false },
            { id: "mock-q5-d", question_id: "mock-q5", option_text: "head.data", is_correct: false }
          ]
        },
        {
          id: "mock-q6",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "How do you find the middle of a linked list efficiently?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q6-a", question_id: "mock-q6", option_text: "Use slow pointer (1 step) and fast pointer (2 steps)", is_correct: true },
            { id: "mock-q6-b", question_id: "mock-q6", option_text: "Count all nodes first", is_correct: false },
            { id: "mock-q6-c", question_id: "mock-q6", option_text: "Binary search on indices", is_correct: false },
            { id: "mock-q6-d", question_id: "mock-q6", option_text: "It's impossible efficiently", is_correct: false }
          ]
        },
        {
          id: "mock-q7",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the worst-case time complexity of searching for a value in a linked list?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q7-a", question_id: "mock-q7", option_text: "O(n)", is_correct: true },
            { id: "mock-q7-b", question_id: "mock-q7", option_text: "O(log n)", is_correct: false },
            { id: "mock-q7-c", question_id: "mock-q7", option_text: "O(1)", is_correct: false },
            { id: "mock-q7-d", question_id: "mock-q7", option_text: "O(n²)", is_correct: false }
          ]
        },
        {
          id: "mock-q8",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "In a doubly linked list, each node has which pointers?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q8-a", question_id: "mock-q8", option_text: "prev and next pointers", is_correct: true },
            { id: "mock-q8-b", question_id: "mock-q8", option_text: "left and right pointers", is_correct: false },
            { id: "mock-q8-c", question_id: "mock-q8", option_text: "parent and child pointers", is_correct: false },
            { id: "mock-q8-d", question_id: "mock-q8", option_text: "Only next pointer", is_correct: false }
          ]
        },
        {
          id: "mock-q9",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What data structure can be efficiently implemented using a linked list?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q9-a", question_id: "mock-q9", option_text: "Stack and Queue", is_correct: true },
            { id: "mock-q9-b", question_id: "mock-q9", option_text: "Only Stack", is_correct: false },
            { id: "mock-q9-c", question_id: "mock-q9", option_text: "Hash Table", is_correct: false },
            { id: "mock-q9-d", question_id: "mock-q9", option_text: "Binary Search Tree", is_correct: false }
          ]
        },
        {
          id: "mock-q10",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the time complexity to append an element at the end of an unsorted linked list without a tail pointer?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q10-a", question_id: "mock-q10", option_text: "O(n)", is_correct: true },
            { id: "mock-q10-b", question_id: "mock-q10", option_text: "O(1)", is_correct: false },
            { id: "mock-q10-c", question_id: "mock-q10", option_text: "O(log n)", is_correct: false },
            { id: "mock-q10-d", question_id: "mock-q10", option_text: "O(n²)", is_correct: false }
          ]
        }
      ]
    },
    progress: {
      id: "mock-progress",
      user_id: "mock-user",
      learning_object_id: loId,
      status: "IN_PROGRESS",
      completion_percentage: 60,
      mastery_score: 62
    }
  };
}

function buildMockProgressMap(lo: LearningObjectDetail) {
  const map = new Map<string, { status: RoadmapNode["status"] }>();
  if (lo.progress) {
    map.set(lo.id, { status: lo.progress.status as RoadmapNode["status"] });
  }
  lo.prerequisites.forEach((pr) => {
    map.set(pr.id, { status: "COMPLETED" });
  });
  lo.dependents.forEach((dep) => {
    map.set(dep.id, { status: "NOT_STARTED" });
  });
  return map;
}

export interface CourseModule extends LearningObject {
  isOnMostTakenPath?: boolean;
}

function buildMockDSACourseRoadmap(): { nodes: RoadmapNode[]; edges: RoadmapEdge[]; mostTakenPathNodeIds: string[] } {
  const modules: CourseModule[] = [
    {
      id: "mock-arrays",
      title: "Arrays",
      slug: "arrays",
      description: "Contiguous memory structures and indexing.",
      difficulty_level: 1,
      estimated_time_minutes: 30,
      status: "published",
      isOnMostTakenPath: true
    },
    {
      id: "mock-pointers",
      title: "Pointers & References",
      slug: "pointers-references",
      description: "Memory addresses and references.",
      difficulty_level: 2,
      estimated_time_minutes: 25,
      status: "published",
      isOnMostTakenPath: true
    },
    {
      id: "mock-linked-list",
      title: "Linked List",
      slug: "linked-list",
      description: "Singly and doubly linked lists with classic operations.",
      difficulty_level: 3,
      estimated_time_minutes: 45,
      status: "published",
      isOnMostTakenPath: true
    },
    {
      id: "mock-stack",
      title: "Stack",
      slug: "stack",
      description: "LIFO data structure.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published",
      isOnMostTakenPath: true
    },
    {
      id: "mock-queue",
      title: "Queue",
      slug: "queue",
      description: "FIFO data structure.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published"
    },
    {
      id: "mock-binary-tree",
      title: "Binary Tree",
      slug: "binary-tree",
      description: "Tree traversal and operations.",
      difficulty_level: 4,
      estimated_time_minutes: 50,
      status: "published",
      isOnMostTakenPath: true
    },
    {
      id: "mock-graph",
      title: "Graph & Graph Algorithms",
      slug: "graph",
      description: "Graph representations and traversals.",
      difficulty_level: 4,
      estimated_time_minutes: 60,
      status: "published"
    },
    {
      id: "mock-sorting",
      title: "Sorting Algorithms",
      slug: "sorting",
      description: "Quick Sort, Merge Sort, and more.",
      difficulty_level: 3,
      estimated_time_minutes: 45,
      status: "published"
    }
  ];

  // Build nodes
  const nodes: RoadmapNode[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    status: "NOT_STARTED" as const,
    difficulty: m.difficulty_level,
    estimatedTime: m.estimated_time_minutes
  }));

  // Extract most-taken path node IDs
  const mostTakenPathNodeIds = modules
    .filter((m) => m.isOnMostTakenPath)
    .map((m) => m.id);

  // Build edges (prerequisites)
  const edges: RoadmapEdge[] = [
    // Arrays -> Pointers
    { source: "mock-arrays", target: "mock-pointers" },
    // Pointers -> Linked List
    { source: "mock-pointers", target: "mock-linked-list" },
    // Linked List -> Stack
    { source: "mock-linked-list", target: "mock-stack" },
    // Linked List -> Queue
    { source: "mock-linked-list", target: "mock-queue" },
    // Arrays -> Binary Tree
    { source: "mock-arrays", target: "mock-binary-tree" },
    // Binary Tree -> Graph
    { source: "mock-binary-tree", target: "mock-graph" },
    // Arrays -> Sorting (can learn independently)
    { source: "mock-arrays", target: "mock-sorting" }
  ];

  return { nodes, edges, mostTakenPathNodeIds };
}
