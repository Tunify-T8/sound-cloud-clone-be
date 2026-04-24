/*
  Warnings:

  - A unique constraint covering the columns `[reporterId,targetId,targetType]` on the table `Report` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetId_targetType_key" ON "Report"("reporterId", "targetId", "targetType");
