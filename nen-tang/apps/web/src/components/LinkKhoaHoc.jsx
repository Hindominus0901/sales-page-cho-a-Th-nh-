/**
 * Hai duong dan cua ca khoa hoc: ban ghi buoi hoc va tai lieu.
 *
 * May chu CAT hai truong nay voi nguoi chua mo khoa (gatedFields cua Course),
 * nen o day khong can kiem quyen lai - khong co link thi khong ve gi. Do cung
 * la ly do khong duoc "an nut cho chac": neu mot ngay nao do may chu quen che,
 * viec an o giao dien se giau mat lo hong thay vi de no lo ra.
 */
import { ExternalLink, FileText, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LinkKhoaHoc({ course }) {
  const ban = String(course?.recording_url || "").trim();
  const tai = String(course?.doc_url || "").trim();
  if (!ban && !tai) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {ban && (
        <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
          <a href={ban} target="_blank" rel="noopener noreferrer">
            <Video className="mr-1.5 h-3.5 w-3.5" /> Xem lại bản ghi
            <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
          </a>
        </Button>
      )}
      {tai && (
        <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
          <a href={tai} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Tài liệu khoá học
            <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
          </a>
        </Button>
      )}
    </div>
  );
}
