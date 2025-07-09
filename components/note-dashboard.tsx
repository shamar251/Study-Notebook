import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import TimeSince from "./TimeSince";
import { FileText, Layers, ListChecks, GraduationCap } from "lucide-react";
import type { Note } from "@/components/note-app";
import React from "react";

interface NoteDashboardProps {
  note: Note;
  folderName?: string;
  testSession?: { score?: number; createdAt?: number };
  quizSession?: { score?: number; createdAt?: number };
}

function countStudyPairs(note: Note): number {
  let count = 0;
  const blocks = note.blocks;
  blocks.forEach((block, idx) => {
    if (block.type === "who") {
      // New structure: linkedBlockIds
      if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
        const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what");
        if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
          count++;
        }
      } else {
        // Old structure: adjacent WHAT block
        if (idx < blocks.length - 1) {
          const nextBlock = blocks[idx + 1];
          if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
            count++;
          }
        }
      }
    }
  });
  return count;
}

function getStudyProgress(note: Note): number {
  if (!note.studyStats) return 0;
  const { quizAttempts = 0, quizCorrect = 0 } = note.studyStats;
  if (quizAttempts === 0) return 0;
  return Math.round((quizCorrect / quizAttempts) * 100);
}

const NoteDashboard: React.FC<NoteDashboardProps> = ({ note, folderName, testSession, quizSession }) => {
  return (
    <div className="flex justify-center items-center h-full w-full">
      <Card className="w-full max-w-xl mx-auto mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-black" />
            {note.title}
          </CardTitle>
          <CardDescription>
            {folderName && <span className="mr-2">Folder: {folderName}</span>}
            <span>Last updated: <TimeSince timestamp={note.updatedAt} /></span>
            {note.lastStudied && (
              <span className="ml-2">Last studied: <TimeSince timestamp={note.lastStudied} /></span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {note.tags && note.tags.length > 0 ? (
              note.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">{tag}</Badge>
              ))
            ) : (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">No tags</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col items-center">
              <Layers className="w-6 h-6 mb-1 text-blue-600" />
              <span className="font-semibold text-lg">{countStudyPairs(note)}</span>
              <span className="text-xs text-gray-500">Study Items</span>
            </div>
            <div className="flex flex-col items-center">
              <ListChecks className="w-6 h-6 mb-1 text-green-600" />
              <span className="font-semibold text-lg">{note.studyStats?.quizAttempts ?? 0}</span>
              <span className="text-xs text-gray-500">Quiz Attempts</span>
              <span className="text-xs text-green-700">Score: {getStudyProgress(note)}%</span>
            </div>
            <div className="flex flex-col items-center">
              <GraduationCap className="w-6 h-6 mb-1 text-yellow-600" />
              <span className="font-semibold text-lg">{testSession?.score !== undefined ? `${testSession.score}%` : "-"}</span>
              <span className="text-xs text-gray-500">Test Score</span>
              {testSession?.createdAt && (
                <span className="text-xs text-gray-400">{new Date(testSession.createdAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex flex-col items-center">
              <Layers className="w-6 h-6 mb-1 text-purple-600" />
              <span className="font-semibold text-lg">{note.studyStats?.flashcardReviews ?? 0}</span>
              <span className="text-xs text-gray-500">Flashcard Reviews</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NoteDashboard; 