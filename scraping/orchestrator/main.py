# In uploader/base_uploader.py or each individual uploader

class BaseUploader:
    # ... existing code ...
    
    def process_files_for_shops(self, shop_ids: List[str]) -> Dict[str, Any]:
        """Process files only for specific shop IDs."""
        files = self.file_manager.get_raw_files(self.entity_name)
        
        # Filter files by shop IDs
        filtered_files = []
        for file in files:
            # Check if file name starts with any shop ID
            for shop_id in shop_ids:
                if file.name.startswith(f"{shop_id}_{self.entity_name}_"):
                    filtered_files.append(file)
                    break
        
        processed = 0
        failed = 0
        total = len(filtered_files)
        
        for file in filtered_files:
            try:
                if self.process_file(file):
                    processed += 1
                else:
                    failed += 1
            except Exception as e:
                self.logger.error(f"Error processing {file.name}: {e}")
                failed += 1
        
        return {
            'processed': processed,
            'failed': failed,
            'total_files': total,
            'filtered_shops': len(shop_ids)
        }